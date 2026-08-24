# ckk-db — 業務データベース（環境ごとに 1 台）

Coolify が **アプリケーションとして** ビルド・起動する PostgreSQL。
`docker-compose` スタックではないので、このディレクトリに compose ファイルは無い。

| Coolify アプリ | ブランチ | ネットワーク別名 | 用途 |
|---|---|---|---|
| `ckk-db-dev` | `dev` | `ckk-db-dev` | 開発 |
| `ckk-db-main` | `main` | `ckk-db-main` | 本番 |

登録は `../../platform/add-db-apps.sh`（冪等）。ホストポートは公開せず、`coolify`
ネットワーク上の別名だけで到達する。

## なぜ Coolify の「データベース」リソースではないのか

このイメージには compose では渡していた前提が全部必要で、アプリケーションとして
Dockerfile を焼くのが一番素直だった:

- PGroonga（全文検索）と pg_cron（キオスクのプレゼンス監視）を積んだ独自イメージ
- `summarize_wal=on`（db-backup の増分ベースバックアップに必須）
- 独自 `pg_hba.conf`（`backup` ロールのレプリケーション接続を許可）
- 初回起動時のロール作成（`init/01-roles.sh`）

## 大事な運用ルール

**自動デプロイは切ってある。** push のたびに DB コンテナが作り直されるのは
事故のもとなので、イメージを更新したいときだけ明示的に:

```bash
coolify/platform/deploy.sh ckk-db-dev    # 確認プロンプトあり
```

**永続ボリュームが `/var/lib/postgresql/data` に付いていること。**
付け忘れたまま再デプロイするとデータが消える。`add-db-apps.sh` が API で
付けようとするが、失敗したら Coolify の UI（Persistent Storage）で付ける。

**パスワードは `/data/coolify/source/.ckk-db-passwords`**（サーバー内・600）。
dev と本番で別の値を使う。サーバー外にバックアップすること。

## スキーマとデータ

このイメージは**スキーマを作らない**。`db-migrate-dev` / `db-migrate-main`
（`../db-migrate/`）が push のたびに `prisma migrate deploy` を流し、その
migration がテーブルも初期マスタも RBAC もフィーチャーフラグも入れる。

素材 / 拠点 / 不良種類 / 承認フローは **本番には入らない**
（`shared-db/sql/extended-master-seed.sql` — 開発・撮影用 DB だけ）。

## 接続

```
postgresql://app:<APP_DB_PASSWORD>@ckk-db-dev:5432/ckk     # nextjs-web-dev / kiosk-dev
postgresql://app:<APP_DB_PASSWORD>@ckk-db-main:5432/ckk    # nextjs-web-main / kiosk-main
postgresql://postgres:<POSTGRES_PASSWORD>@ckk-db-<env>:5432/ckk  # migration / 保守
```

ホストポートが無いので、ワークステーションからは SSH トンネル経由で触る:

```bash
cd shared-db
DB_CONTAINER=<ckk-db-dev のコンテナ名> pnpm migrate:status:remote
```

（Coolify のコンテナ名はハッシュ。`docker ps --filter name=ckk-db` で調べる。）
