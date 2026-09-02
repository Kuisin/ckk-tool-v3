#!/usr/bin/env bash
# ckk-display.sh [画面番号] — Chromium を全画面で開き続けるだけのラッパ。
#
# この Pi は「固定 URL を開くブラウザ」以上のことをしない。何を映すかは
# すべてサーバー側（/display）が決めるので、ここに設定は書かない。
#
# 落ちたら黙って開き直す。現場のテレビは誰も見張っていないので、
# 「エラーで止まったまま」が一番まずい状態。
#
# ■ 1 台の Pi に複数のテレビをつなぐとき
# Raspberry Pi 5 は HDMI が 2 口ある。**画面ごとにブラウザのプロファイルを
# 分ける**のが要点で、こうすると Cookie（= 登録した身分）も別になり、
# サーバーからは「たまたま同じ箱に入っている 2 枚の画面」に見える。
# だから表示内容も倍率も画面ごとに決められる。
#
# 逆にプロファイルを共有すると、2 枚とも同じ Cookie を持つので必ず同じものが
# 映る（しかも片方を失効させると両方止まる）。分けるのはそのため。
#
# 画面番号は 1 から。引数が無ければ 1。

set -u

SCREEN="${1:-1}"
case "$SCREEN" in
  ''|*[!0-9]*) echo "画面番号は数字で指定してください: $SCREEN" >&2; exit 1 ;;
esac

BASE_URL="${CKK_DISPLAY_URL:-https://ckk-kiosk.kai-lab.net/display}"
SCREEN_TOTAL="${CKK_DISPLAY_SCREENS:-1}"

# 自動起動は 2 系統ある（systemd --user と autostart/.desktop）。セッションの
# 種類によってどちらが効くかが変わるので両方仕込んでいる。**同じ画面の
# Chromium が 2 枚立ち上がってはいけない**ので、ロックは画面ごとに取る
# （台ごとに 1 本にすると 2 枚目が起動できなくなる — 実際そうなっていた）。
LOCK="${XDG_RUNTIME_DIR:-/tmp}/ckk-display-${SCREEN}.lock"
exec 9>"$LOCK" 2>/dev/null || true
if command -v flock >/dev/null 2>&1; then
  flock -n 9 || { echo "画面 ${SCREEN} は既に起動しています"; exit 0; }
fi

# プロファイルは**画面ごとに固定**。ここを毎回消したり --incognito を付けたり
# すると、再起動のたびに登録からやり直しになる（トークンは Cookie の中）。
PROFILE_DIR="${CKK_DISPLAY_PROFILE_BASE:-$HOME/.config/ckk-display}/screen-${SCREEN}"
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

# ── どのモニタに出すか ───────────────────────────────────────────────────────
#
# Chromium に「何番目の出力へ」と直接は言えないので、**そのモニタの中にある
# 座標**を渡して、そこで全画面にさせる。1 枚だけのときは何も指定しない
# （指定しないほうが確実に、繋がっている画面に出る）。
#
# 出力の並びは X11 なら xrandr、Wayland なら wlr-randr から読む。どちらも
# 無ければ「横に並んでいる」と仮定して幅を推測する — 当たらないことも
# あるので、そのときは CKK_DISPLAY_POSITION で明示できるようにしてある。
screen_position() {
  [ "$SCREEN_TOTAL" -le 1 ] && return 0
  if [ -n "${CKK_DISPLAY_POSITION:-}" ]; then
    echo "$CKK_DISPLAY_POSITION"; return 0
  fi
  local idx=$((SCREEN - 1))

  if command -v xrandr >/dev/null 2>&1 && [ -n "${DISPLAY:-}" ]; then
    # 例: " 0: +*HDMI-1 1920/598x1080/336+0+0  HDMI-1"
    local geo
    geo=$(xrandr --listmonitors 2>/dev/null | awk -v i="$idx" 'NR>1 && NR==i+2 {print $3}')
    if [ -n "$geo" ]; then
      # 1920/598x1080/336+0+0 → +0+0 の部分
      echo "$geo" | sed -n 's/.*+\([0-9]*\)+\([0-9]*\)$/\1,\2/p'
      return 0
    fi
  fi

  if command -v wlr-randr >/dev/null 2>&1; then
    local pos
    pos=$(wlr-randr 2>/dev/null | awk '/^[A-Za-z]/{n++} /Position:/{if(n==i+1){print $2}}' i="$idx")
    if [ -n "$pos" ]; then echo "${pos/,/,}"; return 0; fi
  fi

  # 最後の手段: 横並びと仮定して 1920 刻み
  echo "$((idx * 1920)),0"
}

POSITION="$(screen_position)"

while true; do
  # 前回が強制終了だった場合の「復元しますか」バーを出さない。
  # 出ると画面の上に帯が残り、誰も消しに行けない。
  if [ -f "$PROFILE_DIR/Default/Preferences" ]; then
    sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' \
      "$PROFILE_DIR/Default/Preferences" 2>/dev/null || true
  fi

  # 画面番号は URL にも載せる。管理画面で「どの箱の何枚目か」が分かると、
  # 2 枚まとめて消えたときに「Pi が落ちた」と判断できる（1 枚だけなら
  # ケーブルかテレビ側）。身分ではなく手掛かりなので、サーバーは
  # これを認証には使わない。
  URL="${BASE_URL}?machine=$(hostname -s 2>/dev/null || echo pi)&screen=${SCREEN}&of=${SCREEN_TOTAL}"

  "$CHROMIUM" \
    --user-data-dir="$PROFILE_DIR" \
    --class="ckk-display-${SCREEN}" \
    ${POSITION:+--window-position="$POSITION"} \
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
