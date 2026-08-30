# shared-db — CKK 共有データベース

Single source of truth for the PostgreSQL database (`ckk`) that holds
**all business data** across apps.

**このディレクトリはスキーマとマイグレーションだけ**で、DB サーバーそのものでは
ない。DB は環境ごとに 1 台あり、どちらも Coolify アプリ（イメージのソースは
`coolify/apps/ckk-db/`、`groonga/pgroonga:4.0.6-alpine-17` ベース）:

| 環境 | Coolify アプリ | 網内ホスト名 |
|---|---|---|
| dev | `ckk-db-dev` | `ckk-db-dev:5432` |
| 本番 | `ckk-db-main` | `ckk-db-main:5432` |

**ホストポートは公開していない。** ワークステーションからは `scripts/remote-db.sh`
（SSH トンネル）で読む。旧 `shared-db` スタック（`~/stacks/shared-db`, LAN
`:15432`）は 2026-08-24 に退役した。

## One DB, one schema per domain

| Schema | Contents | Writer |
|---|---|---|
| `kot` | hr_records, employees, kot_employees, kot_match_review, import_runs, `v_labor` view | kot-import, admintools (role `kot`) |
| `directory` | employee_directory (+ `ldap_guid`: the immutable AD objectGUID apps FK to), ldap_sync_log | vpn-ldap ldap-sync (role `ldap_sync`) |
| `admintools` | mail_accounts, group_members | admintools (role `admintools`) |
| `app` | ALL ckk-tool-v3 business tables in ONE schema — RBAC (users/roles/permissions), master data, business partners, sales (価格試算 → 価格表 → 見積書) — incl. the `app.user_permissions` view | nextjs-web (role `app`) |
| `analytics` | BI/AI 用の名前解決済みレポートビューのみ（`sql/analytics-views.sql`、security_invoker。Prisma 管理外） | postgres（views） |
| `public` | Prisma `_prisma_migrations` only (labor compat views retired 2026-08 — see `sql/metabase-compat.sql`) | — |

The v3 web app owns a **single** `app` schema (Prisma-managed). Its scope is
deliberately **minimal**: 価格試算 (`app.estimates`), 価格表
(`app.price_list_entries` + `price_list_variants` + `price_list_tiers` +
`price_list_discounts`), 見積書
(`app.quotes` + `quote_items`), their master-data deps (`app.material_types` /
`materials` / `products`), business partners (`app.business_partners` + attrs),
`app.files` / `numbering_sequences`, and RBAC (`app.users` / `roles` /
`permissions`). Downstream domains (production / inventory / shipping / billing /
design / log, 注文請書以降) are added table-by-table when their feature lands.

Cross-schema FKs are real — notably `app.users.employee_id → directory.employee_directory.ldap_guid`
(the app's identity link to the shared, AD-synced employee directory, keyed by
the immutable objectGUID so AD renames never orphan the reference). Deliberately
**no** FK from `kot.employees`
to `directory.employee_directory` (2 legacy usernames absent from AD).

## Editing models (the only supported workflow)

```bash
cd shared-db
# 1. edit prisma/schema/*.prisma  (domain ごとに 1 ファイル)
pnpm validate
# 2. create the migration
pnpm migrate:dev -- --name <change>
# 3. regenerate + resync every consumer copy
pnpm generate
cd ../coolify/apps/nextjs-web    && pnpm db:sync-schema && pnpm db:generate
cd ../nextjs-kiosk                 && pnpm db:sync-schema && pnpm db:generate
cd ../prisma-studio                && pnpm db:sync-schema && pnpm db:generate
```

Three synced consumers copy this schema: **nextjs-web**, **nextjs-kiosk** and
**prisma-studio** — all three have `db:sync-schema`, so none of them should ever
drift again (prisma-studio's copy silently rotted for ~5 migrations before it got
the script).

**マイグレーションの適用は手動ではない** — `dev` / `main` へマージすると Coolify の
`db-migrate-dev` / `db-migrate-main` が `shared-db/**` の変更を検知して再ビルドし、
`prisma migrate deploy` → `grants.sql` → `kiosk-cron.sql` → `analytics-views.sql`
を流す。失敗すればそのデプロイが失敗として残る（Coolify のログで見える）。

**手で当てる口は用意していない。** `migrate:deploy` / `migrate:deploy:remote` /
`grants:remote` / `cron:remote` は 2026-08-25 に削除した。手で当てると、後から
いちばん気付きにくい形で壊れる — dev と main がずれる、`grants.sql` は当てたが
`analytics-views.sql` を忘れる、どのデプロイも実行していないのに
`_prisma_migrations` には適用済みと記録される。当てたいならマージする。
それが唯一の手段で、失敗したらマイグレーションを直してもう一度マージする。
`:remote` に残っているのは**読み取り**（`migrate:status:remote`、`psql`）と、
マイグレーションではないデータ投入（`import:legacy:remote`）だけ。

きっかけは GitHub の push webhook（`deploy.ckk-tool.co.jp/webhooks/source/github/
events/manual`。アプリごとに別のシークレット）。**Coolify にアプリを足しただけでは
動かない** — GitHub 側の webhook 登録が別に要る。`add-db-apps.sh` が発行した
シークレットは `/data/coolify/source/.webhook-secrets` にあり、それを使って
`gh api -X POST repos/Kuisin/ckk-tool-v3/hooks` で登録する。
`ckk-db-*`（DB 本体）には **わざと登録していない** — push で DB コンテナが
作り直される事故を防ぐため。

### 期待どおり「差分ゼロ」であること

`prisma migrate diff --from-config-datasource --to-schema prisma/schema --script`
は **空** になるのが正常。GIN インデックス（`match_names`）も
`kiosk_devices.settings_code` の既定値もスキーマ側に書いてあるので、差分が出たら
それは本物の変更。ビュー / トリガ / 関数 / CHECK は Prisma のモデルに存在しない
ため diff には出ない（消えることもない）。

Never hand-edit tables in the DB, never run DDL from the Python apps, and never
run `prisma migrate` from nextjs-web (its `prisma/schema` is a synced copy for
client generation only).

## 初期データ

初期マスタ / RBAC / フィーチャーフラグは **migration `0007`〜`0009`** が入れる
（下の「Migration history」参照）。手で流すものは無い。

`pnpm import:legacy` は FileMaker 由来の取引先マスタ
（`../tools/data-migration/imports/010_bp.sql.gz` — 取引先 459 件、`match_names` 付き。
冪等 upsert）。材種・製品はここには**もう無い** — 2026-07-19 に Excel 由来へ置き換え、
いまは baseline-seed が持っている。

There is no demo/mock seed anymore — all master and BP data comes from the
baseline seed, the legacy import, or the app itself.

## Backup / restore

`./scripts/backup.sh` (DATABASE_URL from `.env`) writes to `backups/`
(gitignored):
- `ckk-<ts>.dump` — full custom-format dump (DDL + data + views), for disaster
  recovery: `pg_restore -d <url> --clean --create ckk-<ts>.dump`.
- `ckk-<ts>.data.sql` — plain-SQL INSERTs of all app schemas, for re-seeding a
  freshly migrated DB.

## Migration history — 2026-08-24 スクウォッシュ

99 本あった履歴を **6 本のベースライン**へ潰した（`20260824000001`〜`000006`）。
1 本の巨大ファイルにせず、読める単位に分けてある:

| migration | 中身 |
|---|---|
| `..0001_baseline_schemas_enums` | スキーマ / pgroonga（ガード付き）/ enum 型 |
| `..0002_baseline_tables_master` | マスタ系テーブル（master / bp / production-master / product-routes） |
| `..0003_baseline_tables_business` | 業務テーブル（sales / purchase / production / shipping / billing / inventory / intake / design） |
| `..0004_baseline_tables_system` | システム系（auth / sys / kiosk / notification / directory） |
| `..0005_baseline_constraints_indexes` | PK・UNIQUE・CHECK・インデックス・**最後に FK 全部** |
| `..0006_baseline_views_functions_triggers` | ビュー / 関数 / トリガ / COMMENT |

FK を最終ファイルに集めてあるので、テーブルがどのファイルにあっても解決できる。
分割は「読みやすさ」のためで、`migrate deploy` は 6 本を順に流すだけ。

ベースラインは旧 99 本を再生した DB の `pg_dump` から作り、**スキーマもデータも
バイト一致**することを確認済み（カタログ比較も一致）。旧履歴に埋まっていた DML は
`sql/baseline-seed.sql` へ分離した。

### 初期データも migration に入っている

「1 回だけ流すもの」は全部 migration にした。手で流す手順書は無い:

| migration | 中身 |
|---|---|
| `..0007_seed_master_data` | 材種（コード構成要素 + 材種 + 既定単価）/ 工程マスタ + 工程依存 / 価格試算設定（`system_settings`）/ 通貨 / `system` ユーザー |
| `..0008_seed_rbac_roles` | 権限コード 18 種 + admin/staff + 業務ロール 15 種 |
| `..0009_seed_feature_flags` | main で公開するアプリ |

つまり **まっさらな DB に `prisma migrate deploy` を流すだけで使える状態になる**
（検証済み: テーブル 114 / 権限 18 / ロール 17 / 権限付与 381 / フラグ 18 /
工程 41 / 材種 13 / 既定単価 765）。

**本番に入れたくないマスタは migration に置けない** — migration はどの DB にも
同じように適用されるため。素材（904）/ 拠点 / 不良種類 / 承認グループ・承認フローは
`sql/extended-master-seed.sql` に分けてある。本番はこれらを運用に合わせて画面から
作る。dev は現行 DB のスナップショットを復元するので実データが入る。撮影用 DB は
`tools/docs-screenshots` がこのファイルを流す。

> **migration に pg_dump の前置きを貼らないこと** — `SELECT pg_catalog.set_config(
> 'search_path', '', false);` が入るとセッションの search_path が空になり、Prisma が
> `_prisma_migrations` を見失って **P1014** で落ちる（データは入った後に落ちるので
> 中途半端な状態になる）。0007 を作り直したときに踏んだ。

一方 **毎デプロイ流し直すもの**（スキーマが育つたびに再適用が要る／冪等）は
migration にせず、`db-migrate-*` コンテナが毎回流す:

- `sql/grants.sql` — 後から増えたテーブルにも権限を行き渡らせる必要がある
- `sql/kiosk-cron.sql` — pg_cron ジョブ定義
- `sql/analytics-views.sql` — 分析ビュー（CREATE OR REPLACE）
- `sql/user-provision-cron.sql` — **本番のみ**（`USER_PROVISION_CRON=1` のときだけ）。
  AD（`directory.employee_directory`）から `app.users` を毎日 02:00 JST に作る
  pg_cron ジョブ + 関数 `app.provision_users_from_directory()`。
  対象は「有効かつ department が入っている」行だけ（AD には ANCA1..14 のような
  機械アカウントが混ざっているため）。`cron.timezone` は GMT なので
  `0 17 * * *` と書く。手で流すなら `SELECT app.provision_users_from_directory();`

`grants.sql` は新規 DB でも通るようにしてある（`kot` / `admintools` / `analytics`
スキーマを作り、init スクリプトが走っていない環境では受け皿ロールを NOLOGIN で
用意し、他アプリのテーブルへの GRANT は存在チェック付き）。

取引先マスタだけは任意の追加ステップ: `pnpm import:legacy`（冪等 upsert）。

既存 DB（既にデータもマスタも入っている）を新しい履歴に合わせ直すとき —
**9 本すべてを「適用済み」として記録する**（0007〜0009 のデータは既に入って
いるので、実行してはいけない）:

```bash
cd shared-db
./scripts/reconcile-baseline.sh            # SSH トンネル経由（確認プロンプト付き）
# ローカル DB なら: DATABASE_URL=… ./scripts/reconcile-baseline.sh --direct
```

`_prisma_migrations` を書き換えるだけで、スキーマにもデータにも触らない。
**スクウォッシュ前に取ったダンプを復元したとき**も同じ手順が要る。
逆に空の DB では使わないこと（そこは `migrate deploy` が正しい）。

ベースラインは `CREATE EXTENSION pgroonga` を `DO` ブロックで包んであるので、
pgroonga の無い開発ホストでも通る（本番の `groonga/pgroonga` イメージには常にある）。

## Roles / connections

Created by `coolify/apps/ckk-db/init/01-roles.sh` (passwords in the
server-side `~/stacks/shared-db/.env`); grants + per-role `search_path` in
`sql/grants.sql` (idempotent — re-run after adding a schema or role;
`ALTER DEFAULT PRIVILEGES` already covers new tables in existing schemas).

| Role | Used by | search_path | Notes |
|---|---|---|---|
| `kot` | kot-import, admintools KOT_DB_URL | `kot, directory` | legacy `CREATE TABLE IF NOT EXISTS` needs CREATE on schema kot |
| `ldap_sync` | vpn-ldap ldap-sync | `directory, kot` | OWNS directory tables (its `CREATE INDEX IF NOT EXISTS` requires ownership) |
| `admintools` | admintools DATABASE_URL | `admintools` | OWNS its tables (startup `ALTER TABLE` self-migration) |
| `app` | nextjs-web Prisma Client | — (Prisma qualifies) | rw all v3 schemas, ro kot/directory |
| `kot_ro` | Metabase db 2 (労務) | `kot, directory` | read-only |
| `metabase_ro` | Metabase db 5 (CKK 業務) | `app, analytics` | read-only, `app` + `analytics` ビュー（機微列はマスク） |
| `fx_rates` | shared-db スタック fx-rates（為替レート日次更新） | `app` | `app.currencies` の `rate_per_100_jpy`/`updated_at` UPDATE のみ |
| `studio_ro` | Prisma Studio (db.kai-lab.net) | all schemas | read-only, every schema |
| `postgres` | Prisma migrations only | — | superuser |

Python apps keep psycopg/SQLAlchemy and unqualified table names — the role
search_path maps them to the right schema, so no code changes were needed.

## History

Consolidated 2026-07-05 from the standalone `kot-db` (kot-import stack) and
`admintools-db` (admintools stack) containers. Their compose services were
removed; the old volumes `kot-import_kot-db-data` and
`admintools_admintools-db-data` remain as cold backups. Metabase db 2
(King of Time 労務) now connects to shared-db as `kot_ro`. The `public.*`
pass-through compat views it originally relied on were **retired 2026-08**: all
cards + the AI labor MCP now read `kot.*` / `directory.*` directly (bare-name
native SQL resolves via the `kot_ro` search_path). Metabase db 5
(CKK 業務) connects as `metabase_ro`, read-only on the `app` business schema.
