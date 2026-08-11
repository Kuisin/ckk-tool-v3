#!/usr/bin/env bash
# provisioning-qr.sh — 端末プロビジョニング QR 生成
#
# 工場出荷状態（初期化直後）のタブレットを、この APK をデバイスオーナーとする
# 専用キオスク端末としてセットアップするための QR コード（JSON）を作る。
# タブレット側: 初期設定の「ようこそ」画面を 6 回タップ → QR スキャナ起動 →
# この QR を読むと APK がダウンロード・インストールされ、キオスクが構成される。
#
# 使い方:
#   ./provisioning-qr.sh <apk> <apk-download-url> [dev|prod]
# 例:
#   ./provisioning-qr.sh \
#       ../app/build/outputs/apk/dev/release/app-dev-release.apk \
#       https://ckk-kiosk-dev.kai-lab.net/ckk-kiosk-dev.apk dev
#
# 注意:
# - checksum は APK ファイルに一致するため、APK を更新したら QR も作り直すこと
# - URL はタブレットの初期設定 Wi-Fi から届く公開 https であること
# - qrencode があれば PNG も出力する（brew install qrencode）
set -euo pipefail

APK=${1:?usage: provisioning-qr.sh <apk> <apk-download-url> [dev|prod]}
URL=${2:?usage: provisioning-qr.sh <apk> <apk-download-url> [dev|prod]}
FLAVOR=${3:-prod}

case "$FLAVOR" in
  dev)  APP_ID="jp.co.ckk.kiosk.dev" ;;
  prod) APP_ID="jp.co.ckk.kiosk" ;;
  *) echo "flavor must be dev or prod" >&2; exit 1 ;;
esac

[ -f "$APK" ] || { echo "APK not found: $APK" >&2; exit 1; }

# APK の SHA-256（URL-safe base64・パディングなし）
CHECKSUM=$(openssl dgst -sha256 -binary "$APK" | openssl base64 -A | tr '+/' '-_' | tr -d '=')

JSON=$(cat <<EOF
{
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "${APP_ID}/jp.co.ckk.kiosk.KioskDeviceAdminReceiver",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": "${URL}",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM": "${CHECKSUM}",
  "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true
}
EOF
)

echo "$JSON"

if command -v qrencode >/dev/null 2>&1; then
  OUT="provisioning-${FLAVOR}.png"
  printf '%s' "$JSON" | qrencode -s 8 -o "$OUT"
  echo "" >&2
  echo "QR PNG: $(pwd)/${OUT}" >&2
else
  echo "" >&2
  echo "qrencode が無いため PNG は未生成（brew install qrencode で自動生成されます）" >&2
fi
