#!/bin/bash
# Tick at the top of every hour and take a backup (backup.sh decides the tier).
# A failed run is logged and retried next hour — the loop never dies.
set -u

echo "[db-backup] scheduler started $(date +'%F %T %Z') (host=${PGHOST:-?} root=${BACKUP_ROOT:-/backups})"

# Take a catch-up backup immediately on start (covers deploys/restarts —
# backup.sh is idempotent per hour, so a same-hour rerun is a no-op).
while true; do
  echo "[db-backup] ===== run $(date +'%F %T %Z') ====="
  backup.sh run || echo "[db-backup] run failed (exit $?)"
  sleep_s=$(( 3600 - $(date +%s) % 3600 ))
  echo "[db-backup] sleeping ${sleep_s}s until the next hour"
  sleep "$sleep_s"
done
