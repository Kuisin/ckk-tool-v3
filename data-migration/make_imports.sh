#!/bin/sh
# Regenerate the committed legacy-import artifacts (data-migration/imports/)
# from mapped.sqlite. Run on the machine that holds mapped.sqlite (see
# MIGRATION_REPORT.md for the rebuild chain if it is missing).
#
#   ./make_imports.sh [path/to/mapped.sqlite]
#
# Output: imports/010_bp.sql.gz, imports/020_material_types.sql.gz,
#         imports/030_products.sql.gz — apply with `pnpm import:legacy`
#         (shared-db) or manually: gunzip -c <f> | psql "$DATABASE_URL".
set -eu
cd "$(dirname "$0")"
SRC="${1:-mapped.sqlite}"

[ -f "$SRC" ] || { echo "mapped.sqlite not found: $SRC" >&2; exit 1; }
mkdir -p imports
TMP=$(mktemp -d)

python3 export_bp_import.py "$SRC" "$TMP/010_bp.sql"
python3 export_master_import.py "$SRC" "$TMP"
mv "$TMP/material_types_import.sql" "$TMP/020_material_types.sql"
mv "$TMP/products_import.sql" "$TMP/030_products.sql"

for f in "$TMP"/*.sql; do
  gzip -9 -n -c "$f" > "imports/$(basename "$f").gz"
done
rm -rf "$TMP"
ls -la imports/
