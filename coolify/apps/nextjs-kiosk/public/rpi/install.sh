#!/usr/bin/env bash
# install.sh — Raspberry Pi を「/display を映すだけの機械」にする。1 回流せば終わり。
#
#   curl -fsSL https://ckk-kiosk.kai-lab.net/rpi/install.sh | bash
#   （検証環境: ... | bash -s -- --dev）
#
# 何をするか:
#   1. chromium と unclutter を入れる
#   2. ckk-display.sh を ~/.local/bin へ置く
#   3. 自動起動を仕込む（Wayland/labwc = autostart、X11 = systemd --user）
#   4. 画面を消さない設定にする
#
# **1 台に複数のテレビをつなぐとき**は --screens 2 を付ける（Pi 5 は HDMI 2 口）。
# 画面ごとにブラウザのプロファイルを分けるので、サーバーからは別々の画面に
# 見え、表示内容も倍率も 1 枚ずつ決められる。
#
# **全台まったく同じコマンドで済む。** 台ごとの設定は一切無い — どの画面かは
# 電源を入れたあとに QR を読んで決める。だから「この Pi はどこ用だったか」を
# 現場が覚えておく必要がない。
#
# 冪等: 何度流しても同じ状態になる。

set -euo pipefail

MAIN_URL="https://ckk-kiosk.kai-lab.net/display"
DEV_URL="https://ckk-kiosk-dev.kai-lab.net/display"
URL="$MAIN_URL"
RAW_BASE="${CKK_DISPLAY_RAW_BASE:-https://ckk-kiosk.kai-lab.net/rpi}"
SCREENS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dev)     URL="$DEV_URL"; shift ;;
    --url)     URL="$2"; shift 2 ;;
    --screens) SCREENS="$2"; shift 2 ;;
    *) echo "使い方: install.sh [--dev] [--url <URL>] [--screens <台数>]" >&2; exit 1 ;;
  esac
done

# 台数の指定が無ければ、繋がっているモニタの数を数える。分からなければ 1。
if [ -z "$SCREENS" ]; then
  if command -v xrandr >/dev/null 2>&1 && [ -n "${DISPLAY:-}" ]; then
    SCREENS=$(xrandr --listmonitors 2>/dev/null | awk 'NR==1{print $2}')
  elif command -v wlr-randr >/dev/null 2>&1; then
    SCREENS=$(wlr-randr 2>/dev/null | grep -c '^[A-Za-z]')
  fi
fi
case "${SCREENS:-}" in ''|*[!0-9]*|0) SCREENS=1 ;; esac

if [ "$(id -u)" = "0" ]; then
  echo "root では実行しないでください（通常のユーザーのまま実行します）" >&2
  exit 1
fi

echo "==> 表示先: $URL"
echo "==> 画面の数: $SCREENS"

# ── 1. 必要なものを入れる ────────────────────────────────────────────────────
echo "==> 必要なソフトを入れています（数分かかります）"
sudo apt-get update -qq
sudo apt-get install -y -qq chromium-browser unclutter x11-xserver-utils \
  || sudo apt-get install -y -qq chromium unclutter x11-xserver-utils

# ── 2. ラッパを置く ─────────────────────────────────────────────────────────
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
if [ -f "$(dirname "$0")/ckk-display.sh" ]; then
  install -m 0755 "$(dirname "$0")/ckk-display.sh" "$BIN_DIR/ckk-display.sh"
else
  curl -fsSL "$RAW_BASE/ckk-display.sh" -o "$BIN_DIR/ckk-display.sh"
  chmod 0755 "$BIN_DIR/ckk-display.sh"
fi

# URL と台数は 1 か所（環境ファイル）だけに書く。スクリプトは書き換えない —
# 更新のたびに手で入れ直す羽目になるため。
mkdir -p "$HOME/.config/ckk-display"
{
  printf 'CKK_DISPLAY_URL=%s\n' "$URL"
  printf 'CKK_DISPLAY_SCREENS=%s\n' "$SCREENS"
} > "$HOME/.config/ckk-display/env"

# ── 3. 自動起動 ─────────────────────────────────────────────────────────────
# Raspberry Pi OS Bookworm 以降の既定は Wayland（labwc / wayfire）。
# systemd --user だけに頼ると、セッションの種類によっては起動しないので、
# autostart も両方置く（二重に起動しないよう、片方は排他ロックを見る）。
# 画面ごとに 1 つ動かすので、テンプレートユニット（%i = 画面番号）にする。
# 画面を増やすときは enable するインスタンスを足すだけで済む。
SESSION_DIR="$HOME/.config/systemd/user"
mkdir -p "$SESSION_DIR"
cat > "$SESSION_DIR/ckk-display@.service" <<'UNIT'
[Unit]
Description=CKK managed display (Chromium kiosk) — screen %i
After=graphical-session.target
PartOf=graphical-session.target

[Service]
Type=simple
EnvironmentFile=%h/.config/ckk-display/env
ExecStart=%h/.local/bin/ckk-display.sh %i
Restart=always
RestartSec=5

[Install]
WantedBy=graphical-session.target
UNIT

# 前のバージョン（画面 1 枚固定）のユニットが残っていると二重に起動する
systemctl --user disable --now ckk-display.service >/dev/null 2>&1 || true
rm -f "$SESSION_DIR/ckk-display.service"

systemctl --user daemon-reload
# 減らしたときに古いインスタンスが残らないよう、いったん全部落としてから張り直す
systemctl --user list-unit-files 'ckk-display@*.service' --no-legend 2>/dev/null \
  | awk '{print $1}' | while read -r u; do
      systemctl --user disable --now "$u" >/dev/null 2>&1 || true
    done
n=1
while [ "$n" -le "$SCREENS" ]; do
  systemctl --user enable "ckk-display@${n}.service" >/dev/null
  n=$((n + 1))
done

# 電源を入れただけで（誰もログインしなくても）動くようにする
sudo loginctl enable-linger "$USER" >/dev/null 2>&1 || true

# ── 4. 画面を消さない ───────────────────────────────────────────────────────
# スクリーンセーバー・自動ブランクを止める。テレビは常時点灯が前提。
AUTOSTART_DIR="$HOME/.config/autostart"
mkdir -p "$AUTOSTART_DIR"
rm -f "$AUTOSTART_DIR"/ckk-display*.desktop
n=1
while [ "$n" -le "$SCREENS" ]; do
  cat > "$AUTOSTART_DIR/ckk-display-${n}.desktop" <<UNIT
[Desktop Entry]
Type=Application
Name=CKK Display ${n}
Exec=$BIN_DIR/ckk-display.sh ${n}
X-GNOME-Autostart-enabled=true
UNIT
  n=$((n + 1))
done

# labwc / wayfire の画面ブランクも切る（存在するときだけ）
if [ -f "$HOME/.config/wayfire.ini" ] && ! grep -q "\[idle\]" "$HOME/.config/wayfire.ini"; then
  printf '\n[idle]\ndpms_timeout = 0\nscreensaver_timeout = 0\n' >> "$HOME/.config/wayfire.ini"
fi

echo
echo "==> 完了しました。再起動すると、各画面にリンクコードが出ます。"
echo "    sudo reboot"
if [ "$SCREENS" -gt 1 ]; then
  echo
  echo "    画面が $SCREENS 枚あります。**1 枚ずつ別々に登録**してください —"
  echo "    それぞれ違うコードが出ます（別々の画面として扱われます）。"
fi
