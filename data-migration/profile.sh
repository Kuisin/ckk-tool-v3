#!/bin/bash
# Profile every extracted SQLite DB: tables, columns, row counts, sample rows.
# Output: profile_report.md  (one section per source file).
set -u
ROOT="/Volumes/Main Storage (4TB)/Data(using)/vs-code/ckk-tool-v3/data-migration"
OUT="$ROOT/extracted"
REP="$ROOT/profile_report.md"

{
  echo "# CKK FileMaker extraction — data profile"
  echo
  echo "Generated from per-file SQLite dumps in \`extracted/\`. Tables with 0 rows are listed but not sampled."
  echo
} > "$REP"

# Order by richest first
for db in "$OUT"/*.sqlite; do
  [ -f "$db" ] || continue
  name=$(basename "$db" .sqlite)
  total=$(sqlite3 "$db" "SELECT name FROM sqlite_master WHERE type='table'" 2>/dev/null | \
          while IFS= read -r t; do sqlite3 "$db" "SELECT count(*) FROM \"$t\"" 2>/dev/null; done | paste -sd+ - | bc 2>/dev/null)
  echo "$((${total:-0}))|$name|$db"
done | sort -t'|' -k1 -rn | while IFS='|' read -r total name db; do
  {
    echo "## $name  (rows: $total)"
    echo
    sqlite3 "$db" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name" 2>/dev/null | while IFS= read -r t; do
      rc=$(sqlite3 "$db" "SELECT count(*) FROM \"$t\"" 2>/dev/null)
      cols=$(sqlite3 "$db" "PRAGMA table_info('$t')" 2>/dev/null | awk -F'|' '{printf "%s, ",$2}' | sed 's/, $//')
      echo "### \`$t\` — $rc rows"
      echo "columns: $cols"
      if [ "${rc:-0}" -gt 0 ]; then
        sqlite3 -csv -header "$db" "SELECT * FROM \"$t\" LIMIT 2" 2>/dev/null | \
          python3 "$ROOT/profile_table.py"
      fi
      echo
    done
  } >> "$REP"
done
echo "wrote $REP"
wc -l "$REP"
