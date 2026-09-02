#!/usr/bin/env bash
# metabase-demo-shots.sh — rebuild the manual's Metabase dashboard screenshots
# (content/manual/analytics.md) from a fully local, throwaway Metabase +
# Postgres. Never WRITES to the real bi.ckk-tool.co.jp instance or ckk-db-dev
# — the CKK業務 dashboards are captured against a read-only pull of the real
# ckk-db-dev business data (business partner names are real dev master data,
# same legacy import used throughout this repo's own screenshot pipeline;
# transactional rows are real but small-scale dev/test activity, not
# production revenue — ckk-db-dev and ckk-db-main are separate databases, see
# root CLAUDE.md). The 労務分析 dashboard is fully fabricated (no real
# employee, ever) since the real `kot` schema only exists on ckk-db-main and
# has no dev counterpart.
#
# Run from tools/docs-screenshots/. Prerequisites: Docker Desktop running,
# `pnpm install --ignore-workspace` + `pnpm exec playwright install chromium`
# already done in this directory, and `pnpm install --frozen-lockfile
# --ignore-workspace` done in ../../shared-db (shared-db has its OWN lockfile,
# outside the root pnpm workspace — see pnpm-workspace.yaml's comment).
#
# What it does:
#   1. Reuses `pnpm docs:seed` (tools/docs-screenshots) for a throwaway
#      pgroonga Postgres (migrate deploy + shared-db demo seeds + legacy BP
#      import) on 127.0.0.1:55432 — same recipe the app screenshots use.
#   2. Overwrites that DB's `app` schema with a READ-ONLY snapshot of the
#      real ckk-db-dev data (scripts/pull-ckk-dev-data.py) — the static demo
#      seed fixtures have fixed sample dates (e.g. always "July 2026") that
#      don't move forward, which reads as stale/sparse next to a live BI
#      tool. Real dev data is what an actual person testing the app produced,
#      so it looks like an active business. Nothing is written back to
#      ckk-db-dev — this only ever SELECTs from it over SSH.
#   3. Applies shared-db/sql/analytics-views.sql + grants.sql (creates the
#      `analytics` schema + `metabase_ro` role — not part of migrate deploy).
#   4. Creates synthetic `kot`/`directory` labor data (scripts/metabase-kot-
#      demo-seed.sql) — the real kot schema is legacy `CREATE TABLE IF NOT
#      EXISTS` from kot-import, not in Prisma, and only exists on production
#      (ckk-db-main); there is no dev copy, so this fabricates one from the
#      real DDL (read via `pg_dump --schema-only`, no real rows ever touched).
#   5. Boots a throwaway `metabase/metabase:v0.63.14` + its own Postgres app
#      DB, completes first-run setup with a local-only admin account.
#   6. Registers two Postgres data sources pointing at the throwaway DB
#      (metabase_ro → app+analytics, kot_ro → kot+directory), applies the
#      same JA table/column labels as production (coolify/common/metabase/sql/
#      *-ja.sql, with the data-source name swapped), and runs
#      coolify/common/metabase/build-business-dashboards.py against it for
#      the 4 CKK業務 dashboards. The 労務分析 dashboard has no reusable
#      builder script (it predates that pattern) — its 4 cards are recreated
#      here as native SQL against kot.v_labor.
#   7. Captures all 5 dashboards full-page with Playwright
#      (capture-metabase-shots.mjs) into content/manual/assets/screenshots/.
#   8. Tears down every local container/network. Nothing persists except the
#      PNGs and this script.
#
# ⚠️ Check every captured PNG before committing, not just that the script
# exited 0. Real dev data is whatever it currently is — e.g. as of 2026-09,
# `app.invoices` has 0 rows on dev, so 請求 (billing) renders "No results"
# everywhere. That's an accurate live-data snapshot but a useless manual
# screenshot; when that happens, fall back to a populated capture for that
# one dashboard instead (skip step 2 for that run, or hand-edit the PNG in
# afterward) rather than shipping an empty dashboard in the manual.
#
# Re-run whenever the live dashboards change materially (new cards, renamed
# filters) so the manual's screenshots stay representative. Exact card/filter
# wording in the manual text should still be checked against the live
# instance (ssh 192.168.50.15, docker exec into metabase-db, read
# report_dashboard/report_dashboardcard — see coolify/common/metabase/README.md)
# since production dashboards drift from the builder script via manual UI edits.

set -euo pipefail
cd "$(dirname "$0")/.."   # tools/docs-screenshots/

REPO_ROOT="$(cd ../.. && pwd)"
SHOT_DEST="$REPO_ROOT/coolify/apps/nextjs-web/content/manual/assets/screenshots"
MB_PORT=3033
MB_ADMIN_EMAIL="manual-shots@example.invalid"
MB_ADMIN_PASSWORD="ManualShots2026!"

echo "== 1. throwaway seeded app DB (127.0.0.1:55432) =="
pnpm docs:seed

echo "== 2. overwrite app schema with real ckk-db-dev data (read-only pull) =="
# Container is Coolify-hash-named; resolve it fresh each time it may have changed:
#   ssh 192.168.50.15 docker run --rm --network coolify alpine getent hosts ckk-db-dev
# then match the printed IP to a container name via:
#   ssh 192.168.50.15 'for c in $(docker ps --format "{{.Names}}"); do echo "$(docker inspect -f "{{.NetworkSettings.Networks.coolify.IPAddress}}" "$c") $c"; done'
DEV_CONTAINER="${CKK_DB_DEV_CONTAINER:?set CKK_DB_DEV_CONTAINER to the current ckk-db-dev container name (see comment above)}"
python3 scripts/pull-ckk-dev-data.py --dev-container "$DEV_CONTAINER"

echo "== 3. analytics views + grants =="
docker exec -i ckk-shots-db psql -U postgres -d ckk -v ON_ERROR_STOP=1 < "$REPO_ROOT/shared-db/sql/analytics-views.sql"
docker exec -i ckk-shots-db psql -U postgres -d ckk -v ON_ERROR_STOP=1 < "$REPO_ROOT/shared-db/sql/grants.sql"
docker exec -i ckk-shots-db psql -U postgres -d ckk -c "ALTER ROLE metabase_ro WITH LOGIN PASSWORD 'localshots';"
docker exec -i ckk-shots-db psql -U postgres -d ckk -c "ALTER ROLE kot_ro WITH LOGIN PASSWORD 'localshots';"

echo "== 4. synthetic kot/directory labor demo data =="
docker exec -i ckk-shots-db psql -U postgres -d ckk -v ON_ERROR_STOP=1 < scripts/metabase-kot-demo-seed.sql

echo "== 5. throwaway Metabase =="
docker network inspect ckk-shots-net >/dev/null 2>&1 || docker network create ckk-shots-net
docker network connect ckk-shots-net ckk-shots-db 2>/dev/null || true
docker rm -f ckk-shots-mb ckk-shots-mb-db >/dev/null 2>&1 || true
docker run -d --rm --name ckk-shots-mb-db --network ckk-shots-net \
  -e POSTGRES_DB=metabase -e POSTGRES_USER=metabase -e POSTGRES_PASSWORD=metabase \
  --tmpfs /var/lib/postgresql/data postgres:17-alpine
until docker exec ckk-shots-mb-db pg_isready -U metabase >/dev/null 2>&1; do sleep 1; done
docker run -d --rm --name ckk-shots-mb --network ckk-shots-net -p ${MB_PORT}:3000 \
  -e MB_DB_TYPE=postgres -e MB_DB_HOST=ckk-shots-mb-db -e MB_DB_PORT=5432 \
  -e MB_DB_DBNAME=metabase -e MB_DB_USER=metabase -e MB_DB_PASS=metabase \
  metabase/metabase:v0.63.14
until curl -sf --max-time 3 "http://localhost:${MB_PORT}/api/health" >/dev/null 2>&1; do sleep 3; done

echo "== 6. first-run setup + data sources + dashboards =="
python3 scripts/metabase-demo-build.py \
  --mb-url "http://localhost:${MB_PORT}" \
  --admin-email "$MB_ADMIN_EMAIL" --admin-password "$MB_ADMIN_PASSWORD" \
  --ja-business-sql "$REPO_ROOT/coolify/common/metabase/sql/metabase-business-ja.sql" \
  --ja-labor-sql "$REPO_ROOT/coolify/common/metabase/sql/metadata-ja.sql" \
  --builder-py "$REPO_ROOT/coolify/common/metabase/build-business-dashboards.py"

echo "== 7. capture =="
mkdir -p /tmp/mb-shots
node capture-metabase-shots.mjs /tmp/mb-shots
mkdir -p "$SHOT_DEST"
for f in sales production billing inventory labor; do
  cp "/tmp/mb-shots/sy0e-mb-${f}.png" "$SHOT_DEST/analytics-${f}-01.png"
done

echo "== 8. teardown =="
docker rm -f ckk-shots-mb ckk-shots-mb-db ckk-shots-db >/dev/null 2>&1 || true
docker network rm ckk-shots-net >/dev/null 2>&1 || true

echo "done — screenshots refreshed in $SHOT_DEST"
