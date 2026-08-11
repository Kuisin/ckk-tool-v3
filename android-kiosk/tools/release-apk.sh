#!/usr/bin/env bash
# release-apk.sh — キオスク APK リリースの一括処理（Mac 上で実行）
#
#   1. dev / prod の release APK を署名付きでビルド（./gradlew）
#   2. docker-compose/nextjs-kiosk/public/apk/ へ固定名でコピー
#      （ckk-kiosk-dev.apk / ckk-kiosk.apk — コミットして Coolify が配信）
#   3. version.json（versionCode / versionName / sha256）を書き出し
#   4. provisioning-qr.sh で dev / prod のプロビジョニング QR を tools/out/ に生成
#      （QR は APK チェックサム連動 — リリースごとに作り直し。out/ は gitignore）
#   5. コミット → PR → デプロイ確認のチェックリストを表示
#
# 前提（一度だけ・README「配布」参照）:
#   - ~/.gradle/gradle.properties に CKK_KEYSTORE_PATH / CKK_KEYSTORE_PASSWORD /
#     CKK_KEY_ALIAS / CKK_KEY_PASSWORD（キーストアはリポジトリ外に保管）
#   - brew install qrencode（QR PNG 出力。無くても JSON は出る）
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ANDROID_DIR=$(dirname "$SCRIPT_DIR")
REPO_DIR=$(dirname "$ANDROID_DIR")
APK_DIR="$REPO_DIR/docker-compose/nextjs-kiosk/public/apk"
OUT_DIR="$SCRIPT_DIR/out"

DEV_URL="https://ckk-kiosk-dev.kai-lab.net/apk/ckk-kiosk-dev.apk"
PROD_URL="https://ckk-kiosk.kai-lab.net/apk/ckk-kiosk.apk"

GRADLE_PROPS="$HOME/.gradle/gradle.properties"
if ! grep -q '^CKK_KEYSTORE_PATH=' "$GRADLE_PROPS" 2>/dev/null; then
  echo "エラー: 署名設定がありません。~/.gradle/gradle.properties に" >&2
  echo "  CKK_KEYSTORE_PATH / CKK_KEYSTORE_PASSWORD / CKK_KEY_ALIAS / CKK_KEY_PASSWORD" >&2
  echo "を設定してください（android-kiosk/README.md「配布」参照）。" >&2
  exit 1
fi

echo "==> release APK をビルド（devRelease / prodRelease）"
(cd "$ANDROID_DIR" && ./gradlew assembleDevRelease assembleProdRelease)

DEV_APK="$ANDROID_DIR/app/build/outputs/apk/dev/release/app-dev-release.apk"
PROD_APK="$ANDROID_DIR/app/build/outputs/apk/prod/release/app-prod-release.apk"
for f in "$DEV_APK" "$PROD_APK"; do
  # 署名設定が効いていないと app-*-release-unsigned.apk になる
  [ -f "$f" ] || { echo "エラー: 署名済み APK が見つかりません: $f" >&2; exit 1; }
done

echo "==> public/apk/ へコピー"
mkdir -p "$APK_DIR"
cp "$DEV_APK" "$APK_DIR/ckk-kiosk-dev.apk"
cp "$PROD_APK" "$APK_DIR/ckk-kiosk.apk"

VERSION_CODE=$(sed -n 's/^[[:space:]]*versionCode = \([0-9][0-9]*\).*/\1/p' "$ANDROID_DIR/app/build.gradle.kts" | head -1)
VERSION_NAME=$(sed -n 's/^[[:space:]]*versionName = "\([^"]*\)".*/\1/p' "$ANDROID_DIR/app/build.gradle.kts" | head -1)
[ -n "$VERSION_CODE" ] && [ -n "$VERSION_NAME" ] || {
  echo "エラー: app/build.gradle.kts から versionCode/versionName を読めませんでした" >&2; exit 1; }

sha256_hex() { openssl dgst -sha256 -r "$1" | awk '{print $1}'; }
DEV_SHA=$(sha256_hex "$APK_DIR/ckk-kiosk-dev.apk")
PROD_SHA=$(sha256_hex "$APK_DIR/ckk-kiosk.apk")

echo "==> version.json を生成"
cat > "$APK_DIR/version.json" <<EOF
{
  "dev":  { "versionCode": ${VERSION_CODE}, "versionName": "${VERSION_NAME}", "sha256": "${DEV_SHA}" },
  "prod": { "versionCode": ${VERSION_CODE}, "versionName": "${VERSION_NAME}", "sha256": "${PROD_SHA}" }
}
EOF

echo "==> プロビジョニング QR を生成（tools/out/）"
mkdir -p "$OUT_DIR"
(cd "$OUT_DIR" && "$SCRIPT_DIR/provisioning-qr.sh" "$APK_DIR/ckk-kiosk-dev.apk" "$DEV_URL" dev > provisioning-dev.json)
(cd "$OUT_DIR" && "$SCRIPT_DIR/provisioning-qr.sh" "$APK_DIR/ckk-kiosk.apk" "$PROD_URL" prod > provisioning-prod.json)

# QR PNG も public/apk/ へ公開する — DC01 マニュアル（/docs の
# キオスク端末セットアップ）がこの URL を埋め込み、常に最新 QR を表示する
if [ -f "$OUT_DIR/provisioning-dev.png" ]; then
  cp "$OUT_DIR/provisioning-dev.png" "$OUT_DIR/provisioning-prod.png" "$APK_DIR/"
fi

cat <<EOF

完了: v${VERSION_NAME} (versionCode ${VERSION_CODE})
  $APK_DIR/ckk-kiosk-dev.apk
  $APK_DIR/ckk-kiosk.apk
  $APK_DIR/version.json
  $APK_DIR/provisioning-{dev,prod}.png   （DC01 マニュアルが参照）
  $OUT_DIR/provisioning-{dev,prod}.{json,png}

次の手順:
  1. git add docker-compose/nextjs-kiosk/public/apk && コミット → PR → dev へマージ
  2. Coolify が nextjs-kiosk-dev をデプロイ後:
       curl -I $DEV_URL   （200 になること。/setup への 307 は proxy 設定漏れ）
  3. dev タブレットで動作確認 → dev→main 昇格（ユーザー操作）で prod URL が有効化
  4. 端末登録: 初期化済みタブレットで「ようこそ」6 タップ → tools/out/ の QR をスキャン
EOF
