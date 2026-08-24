#!/bin/sh
# Apply the database migrations, then idle.
#
# Order matters:
#   1. prisma migrate deploy  — schema baseline + one-shot seed migrations
#   2. grants.sql             — every deploy: new tables need privileges, and
#                               the `app` role 500s on anything it can't read
#   3. kiosk-cron.sql         — pg_cron job definitions (idempotent)
#   4. analytics-views.sql    — Metabase / AI reporting views (CREATE OR REPLACE)
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

echo "==> prisma migrate deploy"
pnpm exec prisma migrate deploy

echo "==> grants.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f sql/grants.sql

echo "==> kiosk-cron.sql"
if psql "$DATABASE_URL" -At -c "SHOW shared_preload_libraries" | grep -q pg_cron; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f sql/kiosk-cron.sql
else
  echo "   pg_cron not preloaded on this server — skipped"
fi

echo "==> analytics-views.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f sql/analytics-views.sql

touch /tmp/migrate-ok
echo "==> migrations applied successfully"

# Coolify expects a long-running process; idling keeps the deployment (and its
# log) inspectable instead of showing a crash-looping container.
exec sleep infinity
