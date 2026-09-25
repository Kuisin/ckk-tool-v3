#!/bin/bash
# Auto-import King of Time attendance on a fixed interval, and serve force-import
# requests made from adminTools (/kot → 期間を指定して取り込み) in between.
set -u
cd /app/kot
INTERVAL="${KOT_INTERVAL_SECONDS:-21600}"   # default 6h
POLL="${KOT_REQUEST_POLL_SECONDS:-20}"      # how often to look for a force-import request

# KOT_ID/KOT_PW may come from the env (legacy) or a kot_settings DB row set via
# adminTools' 設定 modal — db.get_kot_credentials() resolves this every run, so
# we always try. A missing credential now fails fast inside runner.py and gets
# recorded to import_runs (visible in adminTools' /kot log) instead of the
# container silently idling with no visible reason.
next_run=0
while true; do
  now=$(date +%s)
  if [ "$now" -ge "$next_run" ]; then
    echo "[kot-import] ===== run $(date -u +%FT%TZ) ====="
    python runner.py || echo "[kot-import] run failed"
    next_run=$(( $(date +%s) + INTERVAL ))
    echo "[kot-import] next scheduled run in ${INTERVAL}s"
  fi
  python runner.py --pending || echo "[kot-import] pending check failed"
  sleep "$POLL"
done
