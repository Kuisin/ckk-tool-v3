#!/bin/sh
# offsite-sync.sh — バックアップのクラウド同期（オフサイト保全）。
# /backups（PG 増分 + SeaweedFS tar）を毎日 04:30（TZ）に rclone で
# OFFSITE_REMOTE へミラーする。保持世代はソース側（db-backup/seaweed-backup）
# が管理するため sync（ミラー）で良い。
#
# 設定（サーバーの .env のみ — コミット禁止）:
#   OFFSITE_REMOTE      … rclone リモート:パス（例: sakura:ckk-backups / r2:ckk-backups）
#   RCLONE_CONFIG_*     … rclone リモート定義（README 参照）
# 未設定なら警告 1 回で待機（再起動ループさせない）。
set -eu

if [ -z "${OFFSITE_REMOTE:-}" ]; then
  echo "[offsite] OFFSITE_REMOTE 未設定 — オフサイト同期は無効（README 参照）"
  exec sleep infinity
fi

echo "[offsite] enabled → ${OFFSITE_REMOTE}（毎日 04:30 ${TZ:-UTC}）"
while :; do
  now=$(date +%s)
  target=$(date -d "04:30" +%s 2>/dev/null || date -j -f "%H:%M" "04:30" +%s)
  [ "$target" -le "$now" ] && target=$((target + 86400))
  sleep $((target - now))

  echo "[offsite] sync start $(date +%FT%T)"
  if rclone sync /backups "${OFFSITE_REMOTE}" \
      --transfers 4 --checkers 8 --contimeout 30s --timeout 5m \
      --retries 3 --low-level-retries 10 --stats-one-line --stats 5m; then
    echo "[offsite] sync done $(date +%FT%T)"
  else
    echo "[offsite] sync FAILED $(date +%FT%T)（次回 04:30 に再試行）"
  fi
done
