#!/usr/bin/env bash
# provisioning-qr.sh — 端末プロビジョニング QR 生成
#
# 工場出荷状態（初期化直後）のタブレットを、この APK をデバイスオーナーとする
# 専用キオスク端末としてセットアップするための QR コード（JSON）を作る。
# タブレット側: 初期設定の「ようこそ」画面を 6 回タップ → QR スキャナ起動 →
# この QR を読むと APK がダウンロード・インストールされ、キオスクが構成される。
#
# 使い方:
#   ./provisioning-qr.sh <apk> <apk-download-url> [dev|prod] [ca.pem]
# 例:
#   ./provisioning-qr.sh \
#       ../app/build/outputs/apk/dev/release/app-dev-release.apk \
#       https://ckk-kiosk-dev.kai-lab.net/ckk-kiosk-dev.apk dev \
#       ~/ckk-internal-ca.crt
#
# 注意:
# - checksum は APK ファイルに一致するため、APK を更新したら QR も作り直すこと
# - **APK のダウンロード URL に社内 CA の https は使えない。**
#   この取得はアプリが入る前の「初期設定ウィザード」が行うため、社内 CA はまだ
#   端末に存在せず、証明書検証に失敗する（鶏と卵）。選択肢は 2 つ:
#     1. 公開の https（現行。ckk-kiosk*.kai-lab.net）
#     2. 社内の **http**（例 http://kiosk.ckk-tools.loc/apk/...）— QR に入る
#        SHA-256 チェックサムが改ざんを防ぐので、この用途では http が許容される
#   いずれにせよ、プロビジョニング完了後は LAN の https URL を使える
#   （CA がこの QR 経由で入るため）。
# - 第 4 引数に社内 CA（PEM）を渡すと admin extras に載る。端末側は
#   KioskMode.installCaFromProvisioningExtras が受け取って installCaCert する。
#   → *.ckk-tools.loc の https がアプリから使えるようになる（端末ごとの
#     証明書インストール作業は不要）
# - **PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED は false**（プリインストール
#   アプリを残さない）。この端末は Web ラッパー専用なので、OEM のブロートウェアを
#   残す理由が無い — 残すと現場で触れてしまい、ストレージも食う。
#   false にすると managedprovisioning が「**ランチャーに出る**システムアプリ」を
#   無効化する（必須アプリ一覧のものは除く）。ランチャーアイコンを持たない
#   コンポーネントは対象外なので、**WebView・IME・パッケージインストーラ・
#   設定は残る** — ラッパーの表示、キーボード、自動更新、メンテナンスの
#   「設定を開く」はいずれも動く。
#   影響するのは**新規プロビジョニングだけ**。既存の端末を綺麗にするには
#   初期化して QR からやり直す。個別に戻したくなったら端末側で
#   DevicePolicyManager.enableSystemApp() を呼ぶ（初期化でも戻る）。
# - qrencode があれば PNG も出力する（brew install qrencode）
set -euo pipefail

APK=${1:?usage: provisioning-qr.sh <apk> <apk-download-url> [dev|prod] [ca.pem]}
URL=${2:?usage: provisioning-qr.sh <apk> <apk-download-url> [dev|prod] [ca.pem]}
FLAVOR=${3:-prod}
CA_PEM=${4:-}

case "$FLAVOR" in
  dev)  APP_ID="jp.co.ckk.kiosk.dev" ;;
  prod) APP_ID="jp.co.ckk.kiosk" ;;
  *) echo "flavor must be dev or prod" >&2; exit 1 ;;
esac

[ -f "$APK" ] || { echo "APK not found: $APK" >&2; exit 1; }

# APK の SHA-256（URL-safe base64・パディングなし）
CHECKSUM=$(openssl dgst -sha256 -binary "$APK" | openssl base64 -A | tr '+/' '-_' | tr -d '=')

# JSON は jq で組み立てる。証明書の改行をこちらでエスケープすると壊しやすく、
# 実際、手で \n を埋め込む実装は不正な JSON（生の制御文字）を吐いた。
command -v jq >/dev/null 2>&1 || { echo "jq が必要です（brew install jq）" >&2; exit 1; }

# 社内 CA を渡す場合は admin extras に載せる（アプリには同梱しない）。
if [ -n "$CA_PEM" ]; then
  [ -f "$CA_PEM" ] || { echo "CA not found: $CA_PEM" >&2; exit 1; }
  openssl x509 -in "$CA_PEM" -noout -subject >/dev/null 2>&1 \
    || { echo "not a PEM certificate: $CA_PEM" >&2; exit 1; }
  echo "社内 CA を QR に含めます: $(openssl x509 -in "$CA_PEM" -noout -subject)" >&2
fi

# CA は **base64（1 行）** で載せる。PEM をそのまま JSON に入れると改行の
# エスケープ次第で壊れ、しかも jq は読み込みが寛容なので検証も素通りしてしまう
# （= QR は生成できるのに端末で失敗する、原因の見えない不具合になる）。
# 改行を含まない表現にしておけば、その事故が起こりようがない。
# `installCaCert` はもともと byte[] を取るので、端末側は base64 を復号するだけ。
CA_B64=""
if [ -n "$CA_PEM" ]; then
  CA_B64=$(openssl base64 -A -in "$CA_PEM")
fi

JSON=$(jq -n \
  --arg component "${APP_ID}/jp.co.ckk.kiosk.KioskDeviceAdminReceiver" \
  --arg url "$URL" \
  --arg checksum "$CHECKSUM" \
  --arg ca "$CA_B64" \
  '{
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": $component,
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": $url,
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM": $checksum,
    "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": false
  }
  + (if ($ca | length) > 0
     then {"android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE":
             {"jp.co.ckk.kiosk.INTERNAL_CA_PEM_BASE64": $ca}}
     else {} end)')

# QR に載せる前に必ず検証する。証明書のような改行入りの値を扱うので、壊れた
# JSON をそのまま QR にすると、端末側で「読めるのに失敗する」不可解な症状になる。
printf '%s' "$JSON" | jq -e . >/dev/null 2>&1 \
  || { echo "!! 生成した JSON が不正です（QR は作りません）" >&2; printf '%s\n' "$JSON" >&2; exit 1; }

# コンパクト形式 = QR が小さくなり読み取りが安定する。
JSON=$(printf '%s' "$JSON" | jq -c .)

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
