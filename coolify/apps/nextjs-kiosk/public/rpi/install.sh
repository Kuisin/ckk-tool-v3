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

while [ $# -gt 0 ]; do
  case "$1" in
    --dev)  URL="$DEV_URL"; shift ;;
    --url)  URL="$2"; shift 2 ;;
    *) echo "使い方: install.sh [--dev] [--url <URL>]" >&2; exit 1 ;;
  esac
done

if [ "$(id -u)" = "0" ]; then
  echo "root では実行しないでください（通常のユーザーのまま実行します）" >&2
  exit 1
fi

echo "==> 表示先: $URL"

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

# URL は 1 か所（環境ファイル）だけに書く。スクリプトは書き換えない —
# 更新のたびに手で入れ直す羽目になるため。
mkdir -p "$HOME/.config/ckk-display"
printf 'CKK_DISPLAY_URL=%s\n' "$URL" > "$HOME/.config/ckk-display/env"

# ── 3. 自動起動 ─────────────────────────────────────────────────────────────
# Raspberry Pi OS Bookworm 以降の既定は Wayland（labwc / wayfire）。
# systemd --user だけに頼ると、セッションの種類によっては起動しないので、
# autostart も両方置く（二重に起動しないよう、片方は排他ロックを見る）。
SESSION_DIR="$HOME/.config/systemd/user"
mkdir -p "$SESSION_DIR"
cat > "$SESSION_DIR/ckk-display.service" <<'UNIT'
[Unit]
Description=CKK managed display (Chromium kiosk)
After=graphical-session.target
PartOf=graphical-session.target

[Service]
Type=simple
EnvironmentFile=%h/.config/ckk-display/env
ExecStart=%h/.local/bin/ckk-display.sh
Restart=always
RestartSec=5

[Install]
WantedBy=graphical-session.target
UNIT

systemctl --user daemon-reload
systemctl --user enable ckk-display.service >/dev/null

# 電源を入れただけで（誰もログインしなくても）動くようにする
sudo loginctl enable-linger "$USER" >/dev/null 2>&1 || true

# ── 4. 画面を消さない ───────────────────────────────────────────────────────
# スクリーンセーバー・自動ブランクを止める。テレビは常時点灯が前提。
AUTOSTART_DIR="$HOME/.config/autostart"
mkdir -p "$AUTOSTART_DIR"
cat > "$AUTOSTART_DIR/ckk-display.desktop" <<UNIT
[Desktop Entry]
Type=Application
Name=CKK Display
Exec=$BIN_DIR/ckk-display.sh
X-GNOME-Autostart-enabled=true
UNIT

# labwc / wayfire の画面ブランクも切る（存在するときだけ）
if [ -f "$HOME/.config/wayfire.ini" ] && ! grep -q "\[idle\]" "$HOME/.config/wayfire.ini"; then
  printf '\n[idle]\ndpms_timeout = 0\nscreensaver_timeout = 0\n' >> "$HOME/.config/wayfire.ini"
fi

echo
echo "==> 完了しました。再起動すると画面に QR コードが出ます。"
echo "    sudo reboot"
