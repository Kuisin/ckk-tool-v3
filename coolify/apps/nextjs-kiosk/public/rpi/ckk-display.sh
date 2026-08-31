#!/usr/bin/env bash
# ckk-display.sh — Chromium を全画面で開き続けるだけのラッパ。
#
# この Pi は「固定 URL を開くブラウザ」以上のことをしない。何を映すかは
# すべてサーバー側（/display）が決めるので、ここに設定は書かない。
# URL だけが引数で、それも全台で同じ値になる。
#
# 落ちたら黙って開き直す。現場のテレビは誰も見張っていないので、
# 「エラーで止まったまま」が一番まずい状態。

set -u

# 自動起動は 2 系統ある（systemd --user と autostart/.desktop）。セッションの
# 種類によってどちらが効くかが変わるので両方仕込んでいるが、**両方効いた台で
# Chromium が 2 枚立ち上がってはいけない**。先に取れた 1 本だけを走らせる。
LOCK="${XDG_RUNTIME_DIR:-/tmp}/ckk-display.lock"
exec 9>"$LOCK" 2>/dev/null || true
if command -v flock >/dev/null 2>&1; then
  flock -n 9 || { echo "already running"; exit 0; }
fi

URL="${CKK_DISPLAY_URL:-https://ckk-kiosk.kai-lab.net/display}"

# Chromium のプロファイル置き場を**固定する**。ここを毎回消したり
# --incognito を付けたりすると、再起動のたびにペアリングからやり直しになる
# （登録トークンは Cookie に入っている）。
PROFILE_DIR="${CKK_DISPLAY_PROFILE:-$HOME/.config/ckk-display}"
mkdir -p "$PROFILE_DIR"

# 実行ファイル名はディストリで違う
CHROMIUM=""
for c in chromium-browser chromium; do
  if command -v "$c" >/dev/null 2>&1; then CHROMIUM="$c"; break; fi
done
if [ -z "$CHROMIUM" ]; then
  echo "chromium が見つかりません。install.sh を実行してください" >&2
  exit 1
fi

# 画面を消さない（テレビは常時点灯）。X が無い環境では黙って失敗させる。
xset s off        2>/dev/null || true
xset -dpms        2>/dev/null || true
xset s noblank    2>/dev/null || true
# マウスカーソルを隠す（触らない画面に矢印が残っていると故障に見える）
command -v unclutter >/dev/null 2>&1 && (unclutter -idle 0 &) 2>/dev/null || true

while true; do
  # 前回が強制終了だった場合の「復元しますか」バーを出さない。
  # 出ると画面の上に帯が残り、誰も消しに行けない。
  if [ -f "$PROFILE_DIR/Default/Preferences" ]; then
    sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' \
      "$PROFILE_DIR/Default/Preferences" 2>/dev/null || true
  fi

  "$CHROMIUM" \
    --user-data-dir="$PROFILE_DIR" \
    --kiosk \
    --noerrdialogs \
    --disable-session-crashed-bubble \
    --disable-infobars \
    --no-first-run \
    --disable-features=TranslateUI \
    --check-for-update-interval=31536000 \
    --autoplay-policy=no-user-gesture-required \
    "$URL"

  # 落ちた / 閉じられた。少し待って開き直す（暴走ループを避けるため）。
  sleep 3
done
