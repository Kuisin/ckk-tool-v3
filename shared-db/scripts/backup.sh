#!/usr/bin/env bash
# Backup the shared `ckk` database (all schemas, data + DDL).
#
# Usage (from shared-db/, DATABASE_URL in .env — postgres superuser @15432):
#   ./scripts/backup.sh                 # → backups/ckk-YYYYmmdd-HHMMSS.dump (+ .data.sql)
#   ./scripts/backup.sh /path/out       # custom output directory
#
# Or on the server without .env, via the container:
#   docker exec shared-db pg_dump -U postgres -d ckk -Fc > ckk-$(date -u +%Y%m%d-%H%M%S).dump
#
# Restore (data-only, into a freshly migrated DB — see README "Reset / re-baseline"):
#   pg_restore -d "$DATABASE_URL" --data-only --disable-triggers \
#     -n app -n directory -n kot -n admintools ckk-....dump
set -euo pipefail

cd "$(dirname "$0")/.."
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
fi
: "${DATABASE_URL:?DATABASE_URL not set (create shared-db/.env)}"

OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"
TS="$(date -u +%Y%m%d-%H%M%S)"
# 業務データは 2026-07-06 の統合以降すべて `app` にある（旧 auth/master/bp/sales/sys
# は存在しない）。ここを間違えると .data.sql が「エラーなく空」になるので注意。
SCHEMAS=(app directory kot admintools)

# 1. Full custom-format dump (DDL + data + views) — for disaster recovery.
pg_dump -d "$DATABASE_URL" -Fc -f "$OUT_DIR/ckk-$TS.dump"

# 2. Plain-SQL data-only dump of the app schemas — human-readable, and the
#    input for re-seeding a re-baselined DB (INSERTs survive minor DDL drift).
DATA_ARGS=()
for s in "${SCHEMAS[@]}"; do DATA_ARGS+=(-n "$s"); done
pg_dump -d "$DATABASE_URL" --data-only --inserts "${DATA_ARGS[@]}" \
  -f "$OUT_DIR/ckk-$TS.data.sql"

echo "Backup written:"
ls -lh "$OUT_DIR/ckk-$TS".*
