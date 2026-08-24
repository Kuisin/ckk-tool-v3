# db-migrate — マイグレーションを push で自動適用する

`dev` / `main` へマージすると Coolify がこのアプリを再ビルドし、起動時に
その環境の DB へマイグレーションを適用する。**手で `migrate deploy` を流す
運用は終わり**（緊急時の手動口としては `shared-db` の `:remote` スクリプトが残る）。

| Coolify アプリ | ブランチ | 対象 DB |
|---|---|---|
| `db-migrate-dev` | `dev` | `ckk-db-dev` |
| `db-migrate-main` | `main` | `ckk-db-main` |

監視パスは `shared-db/**` — スキーマや SQL を触ったときだけ動く。

## 何を流すか

`entrypoint.sh` の順番には理由がある:

1. `prisma migrate deploy` — スキーマ + 初期データ（migration 0007〜0009）
2. `sql/grants.sql` — **毎回**。後から増えたテーブルに権限が要る（`app` ロールが
   読めないテーブルがあるとアプリが 500 になる）
3. `sql/kiosk-cron.sql` — pg_cron ジョブ（サーバーに pg_cron が無ければ飛ばす）
4. `sql/analytics-views.sql` — Metabase / AI 用ビュー（CREATE OR REPLACE）

2〜4 を migration にしていないのは、**スキーマが育つたびに再適用が必要**だから。
一度きりの migration では古くなる。逆に初期データは「DB ごとに 1 回」で正しいので
migration に置いてある。

## 失敗したらどうなるか

`set -e` なので、`migrate deploy` が失敗した時点で止まる — 半分だけ適用された
スキーマに GRANT を撒くことはない。コンテナは `/tmp/migrate-ok` を作らずに落ち、
healthcheck が通らないので **Coolify がデプロイを失敗として記録する**。原因は
デプロイログにそのまま出る（例: P3018 + 失敗した SQL のエラー）。

成功後は `sleep infinity` で待機する。Coolify が長時間動くプロセスを期待するのと、
落ちたコンテナよりログを追いやすいため。

## ビルドについて

build context はリポジトリルート（`base_directory: "/"`、
`dockerfile_location: "/docker-compose/db-migrate/Dockerfile"`）。`shared-db/`
をまるごと COPY する必要があるため。ルートの `.dockerignore` は deny-all +
allowlist なので、`!shared-db/` と `!docker-compose/db-migrate/` が入っている。
`shared-db/backups/` は除外（ローカルのダンプを持ち込まない）。

## 注意

- `DATABASE_URL` は **postgres スーパーユーザー**。`grants.sql` が所有者変更を
  するので `app` ロールでは足りない。
- Coolify はアプリ間のデプロイ順序を制御しない。`shared-db/**` とアプリコードを
  同時に含む push では、アプリが先に上がってマイグレーション前のスキーマを
  一瞬見る可能性がある（従来の手動運用と同じ窓）。
