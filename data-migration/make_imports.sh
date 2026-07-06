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

# The exporters use PEP 604 unions (str | None) — need Python >= 3.10.
PY="${PYTHON:-}"
if [ -z "$PY" ]; then
  for c in python3.12 python3.11 python3.10 python3; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)'; then
      PY="$c"; break
    fi
  done
fi
[ -n "$PY" ] || { echo "no Python >= 3.10 found (set PYTHON=...)" >&2; exit 1; }

[ -f "$SRC" ] || { echo "mapped.sqlite not found: $SRC" >&2; exit 1; }
mkdir -p imports
TMP=$(mktemp -d)

"$PY" export_bp_import.py "$SRC" "$TMP/010_bp.sql"
"$PY" export_master_import.py "$SRC" "$TMP"
mv "$TMP/material_types_import.sql" "$TMP/020_material_types.sql"
mv "$TMP/products_import.sql" "$TMP/030_products.sql"

# 025: レガシー材種の構造化（入力は生成直後の 020 — mapped.sqlite 不要なので
# `python3 export_material_structuring.py` 単体でコミット済み 020 からも再生成可）
gzip -9 -n -c "$TMP/020_material_types.sql" > "$TMP/020_material_types.sql.gz"
"$PY" export_material_structuring.py "$TMP/020_material_types.sql.gz" "$TMP/025_material_structuring.sql"
rm "$TMP/020_material_types.sql.gz"

for f in "$TMP"/*.sql; do
  gzip -9 -n -c "$f" > "imports/$(basename "$f").gz"
done
rm -rf "$TMP"
ls -la imports/
