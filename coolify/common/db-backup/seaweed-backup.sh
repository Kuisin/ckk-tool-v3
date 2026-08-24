#!/bin/sh
# seaweed-backup.sh — SeaweedFS データの日次 tar スナップショット（監査 P0-3）。
# db-backup コンテナと同じ保持思想: daily は SEAWEED_KEEP_DAYS(14) 日分、
# 月初分を monthly/ にハードリンク昇格して SEAWEED_MONTHLY_KEEP(12) 世代。
# 毎日 AM3:00（TZ）に実行。ソースは read-only マウトの /seaweed-data。
set -eu

ROOT="${SEAWEED_BACKUP_ROOT:-/backups/seaweedfs}"
SRC="${SEAWEED_DATA_DIR:-/seaweed-data}"
KEEP_DAYS="${SEAWEED_KEEP_DAYS:-14}"
MONTHLY_KEEP="${SEAWEED_MONTHLY_KEEP:-12}"

mkdir -p "$ROOT/daily" "$ROOT/monthly"

while :; do
  # 次の 03:00 まで待つ
  now=$(date +%s)
  target=$(date -d "03:00" +%s 2>/dev/null || date -j -f "%H:%M" "03:00" +%s)
  [ "$target" -le "$now" ] && target=$((target + 86400))
  sleep $((target - now))

  day=$(date +%F)
  out="$ROOT/daily/$day.tar.gz"
  tmp="$out.tmp"
  echo "[seaweed-backup] $day start"
  # filer はローカル leveldb + volume ファイル — 稼働中でも tar 可能
  # （書き込み中の完全整合が必要な復元は直近静止点の daily を使う）
  tar -czf "$tmp" -C "$SRC" . && mv "$tmp" "$out"
  echo "[seaweed-backup] $day done ($(du -h "$out" | cut -f1))"

  # 月初スナップショットを monthly へ昇格（ハードリンク）
  if [ "$(date +%d)" = "01" ]; then
    ln -f "$out" "$ROOT/monthly/$(date +%Y-%m).tar.gz" || true
  fi

  # 保持期間を超えた daily / monthly を削除
  find "$ROOT/daily" -name '*.tar.gz' -mtime "+$KEEP_DAYS" -delete || true
  ls -1t "$ROOT/monthly"/*.tar.gz 2>/dev/null | tail -n "+$((MONTHLY_KEEP + 1))" | xargs -r rm -f
done
