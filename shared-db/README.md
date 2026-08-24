# shared-db — CKK 共有データベース

Single source of truth for the shared PostgreSQL database (`ckk`) that holds
**all business data** across apps. Runs as the `shared-db` docker-compose stack
on docker-mac-pro (`~/stacks/shared-db`, image `groonga/pgroonga:4.0.6-alpine-17`,
LAN port `192.168.50.15:15432`, in-cluster host `shared-db:5432`).

## One DB, one schema per domain

| Schema | Contents | Writer |
|---|---|---|
| `kot` | hr_records, employees, kot_employees, kot_match_review, import_runs, `v_labor` view | kot-import, admintools (role `kot`) |
| `directory` | employee_directory (+ `ldap_guid`: the immutable AD objectGUID apps FK to), ldap_sync_log | vpn-ldap ldap-sync (role `ldap_sync`) |
| `admintools` | mail_accounts, group_members | admintools (role `admintools`) |
| `app` | ALL ckk-tool-v3 business tables in ONE schema — RBAC (users/roles/permissions), master data, business partners, sales (試算 → 価格表 → 見積書) — incl. the `app.user_permissions` view | nextjs-web (role `app`) |
| `analytics` | BI/AI 用の名前解決済みレポートビューのみ（`sql/analytics-views.sql`、security_invoker。Prisma 管理外） | postgres（views） |
| `public` | Prisma `_prisma_migrations` only (labor compat views retired 2026-08 — see `sql/metabase-compat.sql`) | — |

The v3 web app owns a **single** `app` schema (Prisma-managed). Its scope is
deliberately **minimal**: 試算 (`app.estimates`), 価格表
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
cd ../docker-compose/nextjs-web    && pnpm db:sync-schema && pnpm db:generate
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
`:remote` スクリプトは緊急時の手動口として残してある。

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

新規 DB を作ったら **`sql/baseline-seed.sql` を 1 回だけ**流す。旧 migration
（`materials_from_excel` 等）に埋まっていた DML をスクウォッシュ時に切り出したもの:
採番マスタ / 材種・素材（Excel 由来）/ 工程マスタ / 承認フロー / 検査テンプレ /
通貨 / `system` ユーザー。**冪等ではない** ので既存 DB には流さないこと。

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/baseline-seed.sql
```

`pnpm import:legacy` は FileMaker 由来の取引先マスタ
（`../data-migration/imports/010_bp.sql.gz` — 取引先 459 件、`match_names` 付き。
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

新規 DB を 1 から作る手順:

```bash
cd shared-db
pnpm migrate:deploy                                    # 1. ベースライン 6 本
psql "$ADMIN_URL" -f sql/grants.sql                    # 2. ロール/権限（冪等）
psql "$ADMIN_URL" -f sql/baseline-seed.sql             # 3. 初期データ（1 回だけ）
psql "$ADMIN_URL" -f sql/rbac-seed.sql                 # 4. 権限コード + admin/staff
psql "$ADMIN_URL" -f sql/roles-seed.sql                # 5. 業務ロール 15 種
psql "$ADMIN_URL" -f sql/feature-flags-seed.sql        # 6. main で公開するアプリ
psql "$ADMIN_URL" -f sql/kiosk-cron.sql                # 7. pg_cron ジョブ
psql "$ADMIN_URL" -f sql/analytics-views.sql           # 8. 分析ビュー
pnpm import:legacy                                     # 9. 取引先マスタ（任意）
```

1〜2 と 7〜8 は冪等なので `db-migrate-*` が毎デプロイ流す。3〜6・9 は
**プロビジョニング時に 1 回だけ**（migrator は流さない）。

既存 DB を新しい履歴に合わせ直すとき（データはそのまま）:

```bash
pnpm remote sh -c 'psql "$DATABASE_URL" -c "TRUNCATE public._prisma_migrations"'
for m in 20260824000001_baseline_schemas_enums 20260824000002_baseline_tables_master \
         20260824000003_baseline_tables_business 20260824000004_baseline_tables_system \
         20260824000005_baseline_constraints_indexes 20260824000006_baseline_views_functions_triggers; do
  pnpm remote pnpm exec prisma migrate resolve --applied "$m"
done
pnpm migrate:status:remote   # → up to date
```

ベースラインは `CREATE EXTENSION pgroonga` を `DO` ブロックで包んであるので、
pgroonga の無い開発ホストでも通る（本番の `groonga/pgroonga` イメージには常にある）。

## Roles / connections

Created by `docker-compose/shared-db/init/01-roles.sh` (passwords in the
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
