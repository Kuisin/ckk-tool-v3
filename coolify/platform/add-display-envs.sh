#!/usr/bin/env bash
# 管理ディスプレイ（SY0I）に必要な env を Coolify のアプリへ足す（冪等）。
# Run ON docker-mac-pro:  bash ~/stacks/coolify/add-display-envs.sh
# (or from the workstation: ssh 192.168.50.15 'bash ~/stacks/coolify/add-display-envs.sh')
#
# 足すもの（nextjs-kiosk-dev / -main）:
#   METABASE_SITE_URL      埋め込み iframe の宛先（Pi のブラウザが直接引く）
#   METABASE_EMBED_SECRET  埋め込みトークンの署名鍵
#
# ※ 2026-08-31 に **実行済み**（metabase と nextjs-kiosk-dev）。
#   nextjs-kiosk-main だけ未適用なので、本番で Metabase を映す前に流すこと。
#
# METABASE_EMBED_SECRET は **Metabase 側の MB_EMBEDDING_SECRET_KEY と同値**。
# metabase は Coolify 管理なので、compose ではなく Coolify の env に入れる。
# **compose（coolify/common/metabase/docker-compose.yml）が main に載るまで
# 埋め込みは有効にならない** — Coolify は main のブランチから compose を読む。
#
# 併せて Metabase の画面で、映したいダッシュボードごとに:
#   1. 「共有」→「埋め込み」を有効化
#   2. 拠点・ライン等のパラメータを **ロック** に設定
# ロックしないと JWT の値は初期値どまりで、URL から上書きできてしまう。

set -euo pipefail

API="http://127.0.0.1:8000/api/v1"
TOKEN_FILE=/data/coolify/source/.api-token
METABASE_URL="https://bi.ckk-tool.co.jp"

TOKEN=$(cat "$TOKEN_FILE")
api() { local m=$1 p=$2; shift 2; curl -sf -X "$m" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json" "$API$p" "$@"; }
api GET /version >/dev/null && echo "API ok"

# Metabase の署名鍵を取り出す（生成はしない — 二重の真実を作らないため）。
# metabase は Coolify 管理（~/stacks/metabase は無い）。鍵は初回にここで作り、
# 以後は使い回す — 作り直すと発行済みの埋め込みトークンが全部無効になる。
SECRET_FILE=/data/coolify/source/.metabase-embed-secret
if [ ! -s "$SECRET_FILE" ]; then
  openssl rand -hex 32 > "$SECRET_FILE"; chmod 600 "$SECRET_FILE"
  echo "鍵を生成: $SECRET_FILE"
fi
MB_EMBEDDING_SECRET_KEY=$(cat "$SECRET_FILE")

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

# Metabase 本体（Coolify アプリ名 metabase）
add_env_if_missing metabase           MB_ENABLE_EMBEDDING      "true"
add_env_if_missing metabase           MB_EMBEDDING_SECRET_KEY  "$MB_EMBEDDING_SECRET_KEY"

add_env_if_missing nextjs-kiosk-dev  METABASE_SITE_URL        "$METABASE_URL"
add_env_if_missing nextjs-kiosk-dev  METABASE_EMBED_SECRET    "$MB_EMBEDDING_SECRET_KEY"

add_env_if_missing nextjs-kiosk-main METABASE_SITE_URL        "$METABASE_URL"
add_env_if_missing nextjs-kiosk-main METABASE_EMBED_SECRET    "$MB_EMBEDDING_SECRET_KEY"

echo
echo "done. deploy with: ./deploy.sh kiosk-dev / ./deploy.sh kiosk-main"
