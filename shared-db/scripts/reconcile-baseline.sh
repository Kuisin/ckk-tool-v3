#!/usr/bin/env bash
# Point an EXISTING database at the squashed migration history.
#
# The 2026-08-24 squash replaced 99 migrations with 9. A database that applied
# the old history still has those 99 rows in `_prisma_migrations`, so the next
# `migrate deploy` refuses ("applied migrations not found in the migrations
# directory"). This rewrites the history table to the new names WITHOUT running
# any SQL — the schema and data are already there.
#
# Use it on: the live dev/prod DB after the squash lands, and on any restored
# snapshot taken before the squash.
# Do NOT use it on an empty database — there `prisma migrate deploy` is correct
# (it creates the schema *and* the seed data).
#
# Usage:
#   cd shared-db
#   ./scripts/reconcile-baseline.sh                 # via the SSH tunnel (:remote)
#   DATABASE_URL=postgres://… ./scripts/reconcile-baseline.sh --direct
set -euo pipefail

cd "$(dirname "$0")/.."

MIGRATIONS=(
  20260824000001_baseline_schemas_enums
  20260824000002_baseline_tables_master
  20260824000003_baseline_tables_business
  20260824000004_baseline_tables_system
  20260824000005_baseline_constraints_indexes
  20260824000006_baseline_views_functions_triggers
  20260824000007_seed_master_data
  20260824000008_seed_rbac_roles
  20260824000009_seed_feature_flags
)

DIRECT=false
[ "${1:-}" = "--direct" ] && DIRECT=true

run() {
  if $DIRECT; then
    "$@"
  else
    scripts/remote-db.sh "$@"
  fi
}

echo "== current state"
run pnpm exec prisma migrate status || true

echo
echo "This rewrites _prisma_migrations only — no schema or data changes."
printf "Continue? type 'yes': "
read -r confirm
[ "$confirm" = "yes" ] || { echo "aborted"; exit 1; }

echo
echo "== clearing the old history"
run sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "TRUNCATE public._prisma_migrations"'

echo "== recording the baseline as applied"
for m in "${MIGRATIONS[@]}"; do
  echo "   $m"
  run pnpm exec prisma migrate resolve --applied "$m"
done

echo
echo "== result"
run pnpm exec prisma migrate status

cat <<'EOS'

期待する出力: "Database schema is up to date!"

このあと `db-migrate-*` が動く環境では、次のデプロイで grants.sql /
kiosk-cron.sql / analytics-views.sql が流れ直る（すべて冪等）。
EOS
