#!/bin/bash
# One backup run against shared-db (invoked hourly by entrypoint.sh).
#
# Tier decision (idempotent per hour — reruns in the same hour are no-ops):
#   daily/YYYY-MM-DD missing    -> FULL pg_basebackup into daily/, and promote
#                                  the month's first daily to monthly/ (cp -al)
#   else                        -> INCREMENTAL vs the newest full into hourly/
#                                  (falls back to a standalone FULL in hourly/
#                                  if WAL summaries can't serve the increment)
#
# Chain safety: hourly incrementals anchor directly on the newest full (depth
# 1) and record it in an `anchor` file; daily pruning never removes the newest
# full nor any full referenced by a surviving hourly. hourly/ dirs without an
# `anchor` file are standalone fulls.
#
# Every backup is verified with pg_verifybackup in tmp/ and moved into place
# atomically. Exit code != 0 means the run failed (entrypoint logs and retries
# next hour).
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
HOURLY_KEEP_HOURS="${HOURLY_KEEP_HOURS:-24}"
DAILY_KEEP_DAYS="${DAILY_KEEP_DAYS:-7}"
MONTHLY_KEEP="${MONTHLY_KEEP:-12}"

log() { echo "[db-backup] $*"; }

# busybox date has no `-d "@epoch"`; try GNU first, then busybox `-D %s`.
epoch_fmt() { # $1=epoch $2=+format
  date -d "@$1" "$2" 2>/dev/null || date -D '%s' -d "$1" "$2"
}

status() { # $1=tier $2=OK|FAIL $3=detail
  echo "$(date +%FT%H:%M) $1 $2 $3" >"$BACKUP_ROOT/latest-status" 2>/dev/null || true
}

take_backup() { # $1=dest (final dir), $2=label, extra args after --
  local dest="$1" label="$2" tmp
  shift 2
  tmp="$BACKUP_ROOT/tmp/$(basename "$dest")"
  rm -rf "$tmp"
  pg_basebackup -D "$tmp" \
    --format=plain --checkpoint=fast --wal-method=stream \
    --manifest-checksums=SHA256 --label="$label" --no-password "$@"
  pg_verifybackup "$tmp"
  mv "$tmp" "$dest"
}

run() {
  mkdir -p "$BACKUP_ROOT/daily" "$BACKUP_ROOT/hourly" "$BACKUP_ROOT/monthly" "$BACKUP_ROOT/tmp"

  # Guard against a concurrent manual run.
  exec 9>"$BACKUP_ROOT/.lock"
  if ! flock -n 9; then
    log "another run holds the lock — skipping"
    return 0
  fi

  # Leftovers from a crashed run.
  rm -rf "$BACKUP_ROOT/tmp"/* 2>/dev/null || true

  local today month stamp
  today=$(date +%F)
  month=$(date +%Y-%m)
  stamp=$(date +%FT%H)

  if [ ! -d "$BACKUP_ROOT/daily/$today" ]; then
    log "taking FULL backup -> daily/$today"
    take_backup "$BACKUP_ROOT/daily/$today" "daily-$today"
    if [ ! -d "$BACKUP_ROOT/monthly/$month" ]; then
      log "promoting daily/$today -> monthly/$month (hardlinks)"
      cp -al "$BACKUP_ROOT/daily/$today" "$BACKUP_ROOT/monthly/$month" \
        || cp -a "$BACKUP_ROOT/daily/$today" "$BACKUP_ROOT/monthly/$month"
    fi
    log "FULL done: $(du -sh "$BACKUP_ROOT/daily/$today" | cut -f1)"
    status daily OK "size=$(du -sh "$BACKUP_ROOT/daily/$today" | cut -f1)"
  elif [ ! -d "$BACKUP_ROOT/hourly/$stamp" ]; then
    # Newest full: our layout keeps only fulls in daily/ (monthly/ mirrors them).
    local anchor
    anchor=$(ls -d "$BACKUP_ROOT/daily"/*/ 2>/dev/null | sort | tail -n 1 || true)
    anchor="${anchor%/}"
    if [ -n "$anchor" ] && [ -f "$anchor/backup_manifest" ]; then
      log "taking INCREMENTAL backup -> hourly/$stamp (anchor: daily/$(basename "$anchor"))"
      if take_backup "$BACKUP_ROOT/hourly/$stamp" "hourly-$stamp" \
           --incremental="$anchor/backup_manifest"; then
        echo "daily/$(basename "$anchor")" >"$BACKUP_ROOT/hourly/$stamp/anchor"
      else
        # e.g. WAL summaries don't reach back to the anchor (summarize_wal
        # enabled after the anchor was taken) — self-heal with a full.
        log "WARNING: incremental failed — falling back to standalone FULL in hourly/$stamp"
        take_backup "$BACKUP_ROOT/hourly/$stamp" "hourly-full-$stamp"
      fi
    else
      log "WARNING: no full backup found — taking standalone FULL in hourly/$stamp"
      take_backup "$BACKUP_ROOT/hourly/$stamp" "hourly-full-$stamp"
    fi
    log "hourly done: $(du -sh "$BACKUP_ROOT/hourly/$stamp" | cut -f1)"
    status hourly OK "size=$(du -sh "$BACKUP_ROOT/hourly/$stamp" | cut -f1)"
  else
    log "hourly/$stamp already exists — nothing to back up this hour"
  fi

  prune
}

prune() {
  local now cutoff_hourly cutoff_daily
  now=$(date +%s)
  cutoff_hourly=$(epoch_fmt $((now - HOURLY_KEEP_HOURS * 3600)) +%FT%H)
  cutoff_daily=$(epoch_fmt $((now - DAILY_KEEP_DAYS * 86400)) +%F)

  local d name
  # hourly: drop dirs older than the cutoff (names sort chronologically).
  for d in "$BACKUP_ROOT/hourly"/*/; do
    [ -d "$d" ] || continue
    name=$(basename "$d")
    if [ "$name" \< "$cutoff_hourly" ]; then
      log "prune hourly/$name (older than ${HOURLY_KEEP_HOURS}h)"
      rm -rf "$d"
    fi
  done

  # daily: drop dirs older than the cutoff, but never the newest full nor any
  # full still referenced by a surviving hourly's anchor file.
  local newest anchors
  newest=$(ls -d "$BACKUP_ROOT/daily"/*/ 2>/dev/null | sort | tail -n 1 || true)
  newest=$(basename "${newest%/}" 2>/dev/null || true)
  anchors=$(cat "$BACKUP_ROOT/hourly"/*/anchor 2>/dev/null | sort -u || true)
  for d in "$BACKUP_ROOT/daily"/*/; do
    [ -d "$d" ] || continue
    name=$(basename "$d")
    [ "$name" \< "$cutoff_daily" ] || continue
    [ "$name" = "$newest" ] && continue
    if printf '%s\n' "$anchors" | grep -qx "daily/$name"; then
      log "keep daily/$name (anchored by a surviving hourly)"
      continue
    fi
    log "prune daily/$name (older than ${DAILY_KEEP_DAYS}d)"
    rm -rf "$d"
  done

  # monthly: keep the newest MONTHLY_KEEP by name.
  local total=0 drop
  total=$(ls -d "$BACKUP_ROOT/monthly"/*/ 2>/dev/null | wc -l || true)
  drop=$((total - MONTHLY_KEEP))
  if [ "$drop" -gt 0 ]; then
    ls -d "$BACKUP_ROOT/monthly"/*/ | sort | while IFS= read -r d; do
      [ "$drop" -gt 0 ] || break
      log "prune monthly/$(basename "$d") (keeping newest $MONTHLY_KEEP)"
      rm -rf "$d"
      drop=$((drop - 1))
    done
  fi
}

case "${1:-run}" in
  run) run ;;
  prune) prune ;;
  *) echo "usage: backup.sh [run|prune]" >&2; exit 1 ;;
esac
