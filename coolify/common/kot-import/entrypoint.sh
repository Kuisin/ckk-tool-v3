#!/bin/bash
# Auto-import King of Time attendance on a fixed interval.
set -u
cd /app/kot
INTERVAL="${KOT_INTERVAL_SECONDS:-21600}"   # default 6h

# KOT_ID/KOT_PW may come from the env (legacy) or a kot_settings DB row set via
# adminTools' 設定 modal — db.get_kot_credentials() resolves this every run, so
# we always try. A missing credential now fails fast inside runner.py and gets
# recorded to import_runs (visible in adminTools' /kot log) instead of the
# container silently idling with no visible reason.
while true; do
  echo "[kot-import] ===== run $(date -u +%FT%TZ) ====="
  python runner.py || echo "[kot-import] run failed"
  echo "[kot-import] sleeping ${INTERVAL}s"
  sleep "$INTERVAL"
done
