#!/bin/sh
# offsite-sync.sh — バックアップのクラウド同期（オフサイト保全）。
#
# **作成即転送**: /backups（PG 増分 + 論理 dump + SeaweedFS tar + pre-restore）に
# 新しいバックアップが書かれた瞬間に（inotify で検知して）rclone copy でリモートへ
# 送る。db-backup / logical-dump / seaweed-backup / restore-agent はいずれも同じ
# /backups ボリュームへ書くため、1 つの watcher で全部を拾える。
#
# 保持（ローカルで prune された分をリモートからも削除）は 1 日 1 回の
# rclone sync（ミラー）で追従する。
#
# 設定（サーバーの .env のみ — コミット禁止）:
#   OFFSITE_REMOTE      … rclone リモート:パス（例: sakura:ckk-backups / r2:ckk-backups）
#   RCLONE_CONFIG_*     … rclone リモート定義（README 参照）
# 未設定なら警告 1 回で待機（再起動ループさせない）。
set -eu

REMOTE="${OFFSITE_REMOTE:-}"
SRC="${OFFSITE_SRC:-/backups}"

if [ -z "$REMOTE" ]; then
  echo "[offsite] OFFSITE_REMOTE 未設定 — オフサイト同期は無効（README 参照）"
  exec sleep infinity
fi

# rclone copy: 新規/更新ファイルのみ追加（リモートは消さない）。作成即転送用。
push() {
  echo "[offsite] copy → ${REMOTE} $(date +%FT%T)"
  rclone copy "$SRC" "$REMOTE" --transfers 4 --checkers 8 --contimeout 30s \
    --timeout 5m --retries 3 --low-level-retries 10 --stats-one-line \
    --exclude 'tmp/**' --exclude '.lock' || echo "[offsite] copy FAILED（次イベントで再試行）"
}
# rclone sync: ミラー（ローカルで削除された世代をリモートからも削除）。日次保持用。
mirror() {
  echo "[offsite] daily mirror (sync) → ${REMOTE} $(date +%FT%T)"
  rclone sync "$SRC" "$REMOTE" --transfers 4 --checkers 8 --contimeout 30s \
    --timeout 5m --retries 3 --low-level-retries 10 --stats-one-line \
    --exclude 'tmp/**' --exclude '.lock' || echo "[offsite] sync FAILED"
}

echo "[offsite] enabled → ${REMOTE}（作成即 copy ＋ 04時台に日次 mirror, TZ=${TZ:-UTC}）"
push  # 起動時キャッチアップ

last_mirror=""
while :; do
  # 新規バックアップの書き込み完了 / 移動 / 作成で起床。何もなくても 30 分で 1 周
  # （取りこぼし・新規サブディレクトリのフォールバック）。
  inotifywait -r -q -e close_write -e moved_to -e create --timeout 1800 "$SRC" >/dev/null 2>&1 || true
  sleep 8  # 1 回のバックアップ実行で複数ファイルが出るのをまとめる（デバウンス）
  push
  # 1 日 1 回、04時台にミラーして保持世代をリモートへ反映
  today=$(date +%F)
  if [ "$today" != "$last_mirror" ] && [ "$(date +%H)" = "04" ]; then
    mirror
    last_mirror="$today"
  fi
done
