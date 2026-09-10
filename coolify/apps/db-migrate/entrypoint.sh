#!/bin/sh
# Apply the database migrations, then idle.
#
# Order matters:
#   0. 失敗して止まった 1 本の復旧 — Prisma は失敗が 1 本あると先へ進まない
#   1. prisma migrate deploy  — schema baseline + one-shot seed migrations
#   2. grants.sql             — every deploy: new tables need privileges, and
#                               the `app` role 500s on anything it can't read
#   3. kiosk-cron.sql         — pg_cron job definitions (idempotent)
#      （user-suspension / security / portal / api も同じブロックで流す）
#   4. analytics-views.sql    — Metabase / AI reporting views (CREATE OR REPLACE)
#   5. user-provision-cron.sql — AD→app.users の日次作成（**本番のみ**・env で切替）
#
# 2–4 are deliberately NOT migrations: they must be re-applied as the schema
# grows, which a once-per-database migration cannot do.
#
# `set -e` means a failure stops everything after it — we never grant on a
# half-migrated schema — and the container then dies without ever creating
# /tmp/migrate-ok, so its healthcheck fails and Coolify reports the deployment
# as failed instead of silently carrying on.
set -eu

: "${DATABASE_URL:?DATABASE_URL is required (postgres superuser — grants.sql changes ownership)}"

cd /work/shared-db

echo "==> waiting for the database"
i=0
until pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "!! database unreachable after 60 attempts" >&2
    exit 1
  fi
  sleep 2
done

# ── 失敗して止まったマイグレーションの復旧 ────────────────────────────────
#
# Prisma は**失敗した 1 本がある間、その先を一切流さない**（P3009）。
# このリポジトリには手で当てる経路が無い（DB を更新するのはデプロイだけ）ので、
# 復旧もここでやらないと成立しない。放っておくと、直したものを merge しても
# 永久に当たらず、`shared-db/**` を触る全員のデプロイが止まったままになる。
# CLAUDE.md の「直して merge し直す」を実際に成り立たせるための段。
#
# ■ 自動で戻してよい理由（Postgres だから成り立つ）
# Postgres は DDL がトランザクショナルで、Prisma はマイグレーション 1 本を
# 1 トランザクションで流す。つまり失敗した 1 本は**丸ごと巻き戻っていて、
# DB はそれを流す前と同じ**。ロールバック済みと記録して流し直すのが正しい。
#
# ■ 自動で戻さない場合
# `CONCURRENTLY` はトランザクション内で実行できないので、失敗すると途中結果
# （無効な索引）が残りうる。それを含む 1 本は**人が見るべき状態**なので、
# ここでは倒さずに落とす。
#
# 直っていなければ次も同じ場所で落ちるだけで、状態は悪化しない。
echo "==> 失敗して止まったマイグレーションが無いか確認"
FAILED=$(psql "$DATABASE_URL" -At -c "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL ORDER BY started_at" 2>/dev/null || true)

for name in $FAILED; do
  file="prisma/migrations/$name/migration.sql"
  if [ -f "$file" ] && grep -qi "CONCURRENTLY" "$file"; then
    echo "!! $name は CONCURRENTLY を含むため自動では戻しません。" >&2
    echo "!! トランザクション外で実行され、途中結果が残っている可能性があります。" >&2
    echo "!! 中身を確認してから resolve してください。" >&2
    exit 1
  fi
  echo "==> $name は失敗して止まっています。ロールバック済みにして流し直します"
  pnpm exec prisma migrate resolve --rolled-back "$name"
done

echo "==> prisma migrate deploy"
pnpm exec prisma migrate deploy

echo "==> grants.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f sql/grants.sql

# pg_cron を要する成果物はまとめて 1 回だけ判定する（SHOW を何度も引かない）。
if psql "$DATABASE_URL" -At -c "SHOW shared_preload_libraries" | grep -q pg_cron; then
  echo "==> kiosk-cron.sql"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f sql/kiosk-cron.sql
  echo "==> user-suspension-cron.sql"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f sql/user-suspension-cron.sql
  echo "==> security-cron.sql"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f sql/security-cron.sql
  echo "==> portal-cron.sql"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f sql/portal-cron.sql
  echo "==> api-cron.sql"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f sql/api-cron.sql
else
  echo "==> kiosk-cron.sql / user-suspension-cron.sql / security-cron.sql / portal-cron.sql / api-cron.sql — pg_cron not preloaded, skipped"
fi

echo "==> analytics-views.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f sql/analytics-views.sql

# AD からのユーザー自動作成（毎日 02:00 JST）は **本番だけ**。
# dev の DB に社員 120 人分のアカウントを量産しても意味が無いので、
# db-migrate-main にだけ USER_PROVISION_CRON=1 を設定する。
if [ "${USER_PROVISION_CRON:-0}" = "1" ]; then
  echo "==> user-provision-cron.sql"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f sql/user-provision-cron.sql
else
  echo "==> user-provision-cron.sql — skipped (USER_PROVISION_CRON != 1)"
fi

touch /tmp/migrate-ok
echo "==> migrations applied successfully"

# Coolify expects a long-running process; idling keeps the deployment (and its
# log) inspectable instead of showing a crash-looping container.
exec sleep infinity
