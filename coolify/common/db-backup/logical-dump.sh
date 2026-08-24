#!/bin/bash
# logical-dump.sh — 日次の論理バックアップ（pg_dump カスタム形式）。
#
# 物理 basebackup（backup.sh）はクラスタ全体の低レベル DR 用。これは復元ツール
# （admintools「バックアップ / 復元」→ restore-agent）が安全にワンクリック復元
# できる自己完結スナップショット: pg_restore --clean で稼働中の DB に戻せる。
#
#   logical/daily/<YYYY-MM-DD>.dump   — kept LOGICAL_KEEP_DAYS(14)
#   logical/monthly/<YYYY-MM>.dump    — 月初分をハードリンク昇格, kept LOGICAL_MONTHLY_KEEP(12)
#
# LOGICAL_DB_URL（= restore-agent の RESTORE_DB_URL と同じスーパーユーザ DSN）が
# 未設定なら待機のみ（安全に無効）。毎日 AM2:30（TZ）に実行。
set -eu

ROOT="${LOGICAL_BACKUP_ROOT:-/backups/logical}"
KEEP_DAYS="${LOGICAL_KEEP_DAYS:-14}"
MONTHLY_KEEP="${LOGICAL_MONTHLY_KEEP:-12}"

if [ -z "${LOGICAL_DB_URL:-}" ]; then
  echo "[logical-dump] LOGICAL_DB_URL unset — idle (logical daily dumps disabled)"
  exec sleep infinity
fi

mkdir -p "$ROOT/daily" "$ROOT/monthly" "$ROOT/manual"

while :; do
  # 次の 02:30 まで待つ
  now=$(date +%s)
  target=$(date -d "02:30" +%s 2>/dev/null || date -j -f "%H:%M" "02:30" +%s)
  [ "$target" -le "$now" ] && target=$((target + 86400))
  sleep $((target - now))

  day=$(date +%F)
  out="$ROOT/daily/$day.dump"
  tmp="$out.tmp"
  echo "[logical-dump] $day start"
  if pg_dump -Fc --no-owner -d "$LOGICAL_DB_URL" -f "$tmp"; then
    mv "$tmp" "$out"
    echo "[logical-dump] $day done ($(du -h "$out" | cut -f1))"
    # 月初分を monthly へ昇格（ハードリンク）
    if [ "$(date +%d)" = "01" ]; then
      ln -f "$out" "$ROOT/monthly/$(date +%Y-%m).dump" || true
    fi
  else
    echo "[logical-dump] $day FAILED" >&2
    rm -f "$tmp"
  fi

  # 保持期間を超えた daily / monthly を削除
  find "$ROOT/daily" -name '*.dump' -mtime "+$KEEP_DAYS" -delete || true
  ls -1t "$ROOT/monthly"/*.dump 2>/dev/null | tail -n "+$((MONTHLY_KEEP + 1))" | xargs -r rm -f
done
