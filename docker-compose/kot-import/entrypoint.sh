#!/bin/bash
# Auto-import King of Time attendance on a fixed interval.
set -u
cd /app/kot
INTERVAL="${KOT_INTERVAL_SECONDS:-21600}"   # default 6h

if [ -z "${KOT_ID:-}" ] || [ -z "${KOT_PW:-}" ]; then
  echo "[kot-import] KOT_ID / KOT_PW not set — sleeping (set them in .env to enable)."
fi

while true; do
  echo "[kot-import] ===== run $(date -u +%FT%TZ) ====="
  if [ -n "${KOT_ID:-}" ] && [ -n "${KOT_PW:-}" ]; then
    python export_daily_csv.py --headless ${KOT_DAYS:+--days "$KOT_DAYS"} || echo "[kot-import] run failed"
  fi
  echo "[kot-import] sleeping ${INTERVAL}s"
  sleep "$INTERVAL"
done
