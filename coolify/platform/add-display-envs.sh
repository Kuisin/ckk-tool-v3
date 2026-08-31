#!/usr/bin/env bash
# 管理ディスプレイ（SY0I）に必要な env を Coolify のアプリへ足す（冪等）。
# Run ON docker-mac-pro:  bash ~/stacks/coolify/add-display-envs.sh
# (or from the workstation: ssh 192.168.50.15 'bash ~/stacks/coolify/add-display-envs.sh')
#
# 足すもの（nextjs-kiosk-dev / -main）:
#   NEXT_PUBLIC_WEB_BASE_URL  ディスプレイが出す QR の飛び先（管理画面のホスト）
#   METABASE_SITE_URL         埋め込み iframe の宛先（Pi のブラウザが直接引く）
#   METABASE_EMBED_SECRET     埋め込みトークンの署名鍵
#
# METABASE_EMBED_SECRET は **Metabase 側の MB_EMBEDDING_SECRET_KEY と同値**で
# なければならない。ここでは既存の値を読むだけで生成しない — 先に
# ~/stacks/metabase/.env へ入れて metabase を再起動しておくこと
# （coolify/common/metabase/.env.example 参照）。
#
# 併せて Metabase の画面で、映したいダッシュボードごとに:
#   1. 「共有」→「埋め込み」を有効化
#   2. 拠点・ライン等のパラメータを **ロック** に設定
# ロックしないと JWT の値は初期値どまりで、URL から上書きできてしまう。

set -euo pipefail

API="http://127.0.0.1:8000/api/v1"
TOKEN_FILE=/data/coolify/source/.api-token
DEV_WEB_URL="https://app-dev.ckk-tool.co.jp"
MAIN_WEB_URL="https://app.ckk-tool.co.jp"
METABASE_URL="https://bi.ckk-tool.co.jp"

TOKEN=$(cat "$TOKEN_FILE")
api() { local m=$1 p=$2; shift 2; curl -sf -X "$m" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json" "$API$p" "$@"; }
api GET /version >/dev/null && echo "API ok"

# Metabase の署名鍵を取り出す（生成はしない — 二重の真実を作らないため）。
MB_ENV=~/stacks/metabase/.env
if [ ! -s "$MB_ENV" ]; then
  echo "!! $MB_ENV が無い。先に metabase スタックを構成すること"; exit 1
fi
# shellcheck disable=SC1090
MB_EMBEDDING_SECRET_KEY=$(grep -E '^MB_EMBEDDING_SECRET_KEY=' "$MB_ENV" | cut -d= -f2- || true)
if [ -z "${MB_EMBEDDING_SECRET_KEY:-}" ] || [ "$MB_EMBEDDING_SECRET_KEY" = "change-me" ]; then
  echo "!! MB_EMBEDDING_SECRET_KEY が未設定。次で作って $MB_ENV に入れ、metabase を再起動:"
  echo "   openssl rand -hex 32"
  exit 1
fi

add_env_if_missing() { # app_name key value
  local app=$1 key=$2 value=$3 uuid
  uuid=$(api GET /applications | jq -r ".[] | select(.name == \"$app\") | .uuid" | head -1)
  [ -n "$uuid" ] || { echo "!! app not found: $app"; return 1; }
  if api GET "/applications/$uuid/envs" | jq -e ".[] | select(.key == \"$key\")" >/dev/null; then
    echo "$app: $key already set"
  else
    api POST "/applications/$uuid/envs" -d "{\"key\": \"$key\", \"value\": \"$value\"}" >/dev/null \
      && echo "$app: $key added (redeploy to apply)"
  fi
}

add_env_if_missing nextjs-kiosk-dev  NEXT_PUBLIC_WEB_BASE_URL "$DEV_WEB_URL"
add_env_if_missing nextjs-kiosk-dev  METABASE_SITE_URL        "$METABASE_URL"
add_env_if_missing nextjs-kiosk-dev  METABASE_EMBED_SECRET    "$MB_EMBEDDING_SECRET_KEY"

add_env_if_missing nextjs-kiosk-main NEXT_PUBLIC_WEB_BASE_URL "$MAIN_WEB_URL"
add_env_if_missing nextjs-kiosk-main METABASE_SITE_URL        "$METABASE_URL"
add_env_if_missing nextjs-kiosk-main METABASE_EMBED_SECRET    "$MB_EMBEDDING_SECRET_KEY"

echo
echo "done. deploy with: ./deploy.sh kiosk-dev / ./deploy.sh kiosk-main"
