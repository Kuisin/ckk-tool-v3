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
# **全部は送らない。** /backups は 7.8GB あるが、その大半（hourly 5.1GB +
# daily 2.3GB）は物理増分で、ローカルの高速復旧のためのもの。オフサイトが要る
# のは「サーバーごと失った」場合で、そこで使うのは論理 dump と月次フルなので、
# 既定では復旧に要る最小集合だけを送る。実測 8.19GiB → **1.10GiB**（5,588 objects,
# 2026-09-03 時点）で、R2 の無料枠（10GB / Class A 100万回）に十分収まる。
# オフサイトの RPO は論理 dump の間隔 = 24 時間になる（ローカルは 1 時間のまま）。
#
# 設定（サーバーの .env のみ — コミット禁止）:
#   OFFSITE_REMOTE      … rclone リモート:パス（例: r2crypt:ckk-backups）
#                          個人情報を含むため **crypt リモート推奨**（README 参照）
#   OFFSITE_INCLUDE     … 送る対象（空白区切り）。既定は下記の最小集合
#   OFFSITE_MAX_BYTES   … これを超えたら**送らない**（既定 8GiB）。下記参照
#   RCLONE_CONFIG_*     … rclone リモート定義（README 参照）
# 未設定なら警告 1 回で待機（再起動ループさせない）。
set -eu

REMOTE="${OFFSITE_REMOTE:-}"
SRC="${OFFSITE_SRC:-/backups}"
# 復旧に要る最小集合。hourly/ と daily/ は意図的に外す（上のコメント参照）。
OFFSITE_INCLUDE="${OFFSITE_INCLUDE:-logical/** monthly/** aux/** aux-monthly/** seaweedfs/** aux-status.json latest-status}"
FILTER_FILE=/tmp/offsite-filter.txt

# **無料枠を超えたら課金されるのではなく、送るのをやめる。**
# Cloudflare には R2 の支払い上限（ハードキャップ）が無い — 長く要望が出ている
# が機能として存在しないので、「無料に収める」は送信側で担保するしかない。
# 無料枠 10GB に対して既定 8GiB で止める。超過は静かに諦めず必ず記録する
# （オフサイトが止まること自体が事故なので、気付けないほうが困る）。
OFFSITE_MAX_BYTES="${OFFSITE_MAX_BYTES:-8589934592}"  # 8 GiB
STATUS_FILE="${OFFSITE_STATUS_FILE:-/tmp/offsite-status.json}"

# rclone のフィルタファイルを組む（先勝ち。最後の "- *" で残りを全部落とす）。
build_filter() {
  : >"$FILTER_FILE"
  for pat in $OFFSITE_INCLUDE; do printf '+ %s\n' "$pat" >>"$FILTER_FILE"; done
  printf -- '- *\n' >>"$FILTER_FILE"
}

if [ -z "$REMOTE" ]; then
  echo "[offsite] OFFSITE_REMOTE 未設定 — オフサイト同期は無効（README 参照）"
  exec sleep infinity
fi

# 送る前に対象の総量を測る。上限超えなら送信を中止（課金させない）。
# 測るのはローカルの絞り込み後の量 — mirror でリモートはこれに一致するので、
# リモートを数えて Class B を消費するより安く、かつ事前に判る。
status_write() { # $1=state $2=bytes $3=detail
  printf '{"at":"%s","state":"%s","bytes":%s,"limit":%s,"detail":"%s"}\n' \
    "$(date -Iseconds)" "$1" "${2:-0}" "$OFFSITE_MAX_BYTES" "${3:-}" >"$STATUS_FILE" 2>/dev/null || true
}

within_limit() {
  bytes=$(rclone size "$SRC" --filter-from "$FILTER_FILE" --json 2>/dev/null \
          | tr ',' '\n' | sed -n 's/.*"bytes":[[:space:]]*\([0-9]*\).*/\1/p' | head -1)
  if [ -z "$bytes" ]; then
    echo "[offsite] ERROR 対象サイズを測れなかった — 安全側に倒して送らない"
    status_write error "" "size measurement failed"
    return 1
  fi
  if [ "$bytes" -gt "$OFFSITE_MAX_BYTES" ]; then
    echo "[offsite] ERROR 対象 ${bytes}B が上限 ${OFFSITE_MAX_BYTES}B を超過 — **送信を中止**"
    echo "[offsite]       保持を縮めるか OFFSITE_MAX_BYTES を上げること（R2 の無料枠は 10GB）"
    status_write over_limit "$bytes" "refused: over OFFSITE_MAX_BYTES"
    return 1
  fi
  status_write ok "$bytes" ""
  return 0
}

# rclone copy: 新規/更新ファイルのみ追加（リモートは消さない）。作成即転送用。
push() {
  within_limit || return 0
  echo "[offsite] copy → ${REMOTE} $(date +%FT%T)"
  rclone copy "$SRC" "$REMOTE" --transfers 4 --checkers 8 --contimeout 30s \
    --timeout 5m --retries 3 --low-level-retries 10 --stats-one-line \
    --filter-from "$FILTER_FILE" || echo "[offsite] copy FAILED（次イベントで再試行）"
}
# rclone sync: ミラー（ローカルで削除された世代をリモートからも削除）。日次保持用。
mirror() {
  within_limit || return 0
  echo "[offsite] daily mirror (sync) → ${REMOTE} $(date +%FT%T)"
  rclone sync "$SRC" "$REMOTE" --transfers 4 --checkers 8 --contimeout 30s \
    --timeout 5m --retries 3 --low-level-retries 10 --stats-one-line \
    --filter-from "$FILTER_FILE" || echo "[offsite] sync FAILED"
}

build_filter
# inotify は OFFSITE_INCLUDE の対象ディレクトリだけを見る。/backups を丸ごと
# 見ると hourly/・daily/（送らないもの）の書き込みにも毎回反応し、5,588 件との
# 全比較（実測 HEAD 5,588 回 = R2 Class B）を無駄に繰り返す。送る対象は
# logical/・aux/・aux-monthly/・seaweedfs/ が日 1 回書くだけなので、それ以外を
# 見張る理由が無い（実測: 監視を絞る前は 31 トリガー/日 → Class B 使用率
# 月 52%、絞った後は ~3〜4 トリガー/日 → 月 6% 程度に収まる）。
WATCH_PATHS=""
for pat in $OFFSITE_INCLUDE; do
  top="${pat%%/*}"
  case " $WATCH_PATHS " in *" $SRC/$top "*) ;; *) [ -e "$SRC/$top" ] && WATCH_PATHS="$WATCH_PATHS $SRC/$top" ;; esac
done
[ -z "$WATCH_PATHS" ] && WATCH_PATHS="$SRC"  # 対象ディレクトリが1つも無ければ安全側で全体監視

echo "[offsite] enabled → ${REMOTE}（作成即 copy ＋ 04時台に日次 mirror, TZ=${TZ:-UTC}）"
echo "[offsite] 対象: ${OFFSITE_INCLUDE}"
echo "[offsite] 監視: ${WATCH_PATHS}"
push  # 起動時キャッチアップ

last_mirror=""
while :; do
  # 新規バックアップの書き込み完了 / 移動 / 作成で起床。何もなくても 30 分で 1 周
  # （取りこぼし・新規サブディレクトリのフォールバック）。
  # shellcheck disable=SC2086 — WATCH_PATHS は意図的な複数パス展開
  inotifywait -r -q -e close_write -e moved_to -e create --timeout 1800 $WATCH_PATHS >/dev/null 2>&1 || true
  sleep 8  # 1 回のバックアップ実行で複数ファイルが出るのをまとめる（デバウンス）
  push
  # 1 日 1 回、04時台にミラーして保持世代をリモートへ反映
  today=$(date +%F)
  if [ "$today" != "$last_mirror" ] && [ "$(date +%H)" = "04" ]; then
    mirror
    last_mirror="$today"
  fi
done
