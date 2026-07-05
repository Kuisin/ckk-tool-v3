#!/bin/bash
# Batch-extract CKK FileMaker .fp7 files to per-file SQLite via patched fmptools.
# Usage: extract_all.sh small   -> files < 1GB
#        extract_all.sh big     -> files >= 1GB
set -u
SRC="/Users/kaiseisawada/Desktop/CKK/filemaker_data/生産管理システム"
ROOT="/Volumes/Main Storage (4TB)/Data(using)/vs-code/ckk-tool-v3/data-migration"
BIN="$ROOT/tools/fmptools/fmp2sqlite"
OUT="$ROOT/extracted"
LOG="$ROOT/extract_log.tsv"
mode="${1:-small}"

mkdir -p "$OUT"
# header (once)
[ -f "$LOG" ] || printf "status\ttables\trows\tsecs\tout_mb\trel_path\n" > "$LOG"

# Build file list, excluding the 2022.9.19 backup and the redundant " - コピー" dup.
while IFS= read -r f; do
  # Skip the 2022.9.19 backup dir, and Finder "copy" duplicates. The copy marker
  # is matched via the ASCII " - " substring (normalization-safe; matching the
  # Japanese "コピー" literal fails under macOS NFD vs NFC filename encoding).
  case "$f" in
    *"2022.9.19"*) continue;;
    *" - "*) continue;;
  esac
  sz=$(stat -f%z "$f")
  if [ "$mode" = "small" ] && [ "$sz" -ge 1073741824 ]; then continue; fi
  if [ "$mode" = "big" ]   && [ "$sz" -lt 1073741824 ]; then continue; fi

  rel="${f#$SRC/}"
  safe=$(printf '%s' "$rel" | tr '/' '__'); safe="${safe%.fp7}"
  dst="$OUT/$safe.sqlite"
  rm -f "$dst"

  start=$(date +%s)
  errtxt=$("$BIN" "$f" "$dst" 2>&1 >/dev/null)
  rc=$?
  secs=$(( $(date +%s) - start ))

  if [ "$rc" -ne 0 ]; then
    st="ERR_rc$rc"; tbl=0; rows=0; ombytes=0
    printf '%s | %s\n' "$rel" "$(printf '%s' "$errtxt" | head -1)" >> "$ROOT/extract_errors.txt"
  elif [ -f "$dst" ]; then
    st="OK"
    tbl=$(sqlite3 "$dst" "SELECT count(*) FROM sqlite_master WHERE type='table'" 2>/dev/null || echo 0)
    rows=$(sqlite3 "$dst" "SELECT name FROM sqlite_master WHERE type='table'" 2>/dev/null | \
           while IFS= read -r t; do sqlite3 "$dst" "SELECT count(*) FROM \"$t\"" 2>/dev/null; done | \
           paste -sd+ - | bc 2>/dev/null)
    rows=${rows:-0}
    ombytes=$(stat -f%z "$dst")
  else
    st="NO_OUTPUT"; tbl=0; rows=0; ombytes=0
  fi
  ommb=$(( ombytes / 1048576 ))
  printf "%s\t%s\t%s\t%s\t%s\t%s\n" "$st" "$tbl" "$rows" "$secs" "$ommb" "$rel" >> "$LOG"
  printf "[%s] %-6s tbl=%-3s rows=%-7s %ss  %s\n" "$mode" "$st" "$tbl" "$rows" "$secs" "$rel"
done < <(find "$SRC" -name "*.fp7" -print | sort)

echo "=== $mode wave done ==="
