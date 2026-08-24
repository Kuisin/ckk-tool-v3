#!/usr/bin/env bash
# Register the po-extract (受注請書 抽出 API) apps in Coolify (idempotent).
# Run ON docker-mac-pro:  bash ~/stacks/coolify/add-po-extract-apps.sh
# (or from the workstation: ssh 192.168.50.15 'bash ~/stacks/coolify/add-po-extract-apps.sh')
#
# Creates (mirroring add-kiosk-apps.sh):
#   po-extract-dev   branch dev   環境 development
#   po-extract-main  branch main  環境 production
#
# **内部専用** — ホストポートを公開せず、ドメインも割り当てない。
# Coolify のコンテナ名はハッシュなので、そのままでは他アプリから名前で引けない
# （nextjs-web が socat リレーを置いているのはこのため）。ここでは
# custom_network_aliases で `po-extract-dev` / `po-extract-main` という
# **安定した別名**を coolify ネットワーク上に付ける — ポート公開もリレーも不要。
#
# 呼び出し側は nextjs-web の PO_EXTRACT_URL:
#   dev  → http://po-extract-dev:8000
#   main → http://po-extract-main:8000
#
# GPU（ollama）は ai-stack に 1 つだけ置いたまま両環境で共有する（GPU は 1 枚）。
# po-extract 自体は状態を持たない（OCR は CPU・モデルは ollama 側）ので、
# 2 系統に増やしてもデータ移行は不要。

set -euo pipefail

GIT_REPO="https://github.com/Kuisin/ckk-tool-v3"
# po-extract/Dockerfile は自分のディレクトリを build context として書かれている。
BASE_DIR="/coolify/apps/po-extract"
# dockerfile_location は base_directory からの相対（Coolify が連結する）。
# リポジトリ root からの絶対パスで書くと
# /coolify/apps/po-extract/coolify/apps/po-extract/Dockerfile を探して失敗する。
DOCKERFILE="/Dockerfile"
WATCH_PATHS="coolify/apps/po-extract/**"
API="http://127.0.0.1:8000/api/v1"
TOKEN_FILE=/data/coolify/source/.api-token
WEBHOOK_FILE=/data/coolify/source/.webhook-secrets

TOKEN=$(cat "$TOKEN_FILE")
api() { local m=$1 p=$2; shift 2; curl -sf -X "$m" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json" "$API$p" "$@"; }
api GET /version >/dev/null && echo "API ok"

SERVER_UUID=$(api GET /servers | jq -r '.[0].uuid')
PROJECT_UUID=$(api GET /projects | jq -r '.[] | select(.name == "ckk") | .uuid' | head -1)
[ -n "$PROJECT_UUID" ] || { echo "!! project ckk not found — run setup.sh first"; exit 1; }

create_app() { # name branch env_name alias
  local name=$1 branch=$2 env_name=$3 alias=$4 uuid secret
  uuid=$(api GET /applications | jq -r ".[] | select(.name == \"$name\") | .uuid" | head -1)
  if [ -z "$uuid" ]; then
    secret=$(openssl rand -hex 20)
    # ports_exposes はコンテナ側のポート宣言のみ。ports_mappings を付けない＝
    # ホストには出さない。autogenerate_domain false ＝ 公開 URL も作らない。
    uuid=$(api POST /applications/public -d "{
      \"project_uuid\": \"$PROJECT_UUID\",
      \"server_uuid\": \"$SERVER_UUID\",
      \"environment_name\": \"$env_name\",
      \"name\": \"$name\",
      \"description\": \"CKK po-extract 受注請書抽出 API ($branch) — internal only\",
      \"git_repository\": \"$GIT_REPO\",
      \"git_branch\": \"$branch\",
      \"build_pack\": \"dockerfile\",
      \"base_directory\": \"$BASE_DIR\",
      \"dockerfile_location\": \"$DOCKERFILE\",
      \"ports_exposes\": \"8000\",
      \"autogenerate_domain\": false,
      \"health_check_enabled\": false,
      \"is_auto_deploy_enabled\": true,
      \"manual_webhook_secret_github\": \"$secret\",
      \"instant_deploy\": false
    }" | jq -r '.uuid')
    echo "$name github_webhook_secret=$secret" >> "$WEBHOOK_FILE"; chmod 600 "$WEBHOOK_FILE"
    echo "created $name: $uuid"
  else
    echo "exists  $name: $uuid"
  fi

  # 安定した別名 + ビルド設定（再実行しても同じ状態に収束させる）。
  api PATCH "/applications/$uuid" -d "{
    \"base_directory\": \"$BASE_DIR\",
    \"dockerfile_location\": \"$DOCKERFILE\",
    \"watch_paths\": \"$WATCH_PATHS\",
    \"custom_network_aliases\": \"$alias\"
  }" >/dev/null && echo "build settings + network alias ($alias) applied for $name"

  if [ "$(api GET "/applications/$uuid/envs" | jq 'length')" != "0" ]; then
    echo "envs already present for $name — skipping (manage in Coolify UI)"
    return 0
  fi
  # ollama は ai-stack 側の 1 台を共有（GPU 1 枚）。OWN_COMPANY 等は app.py の既定でよい。
  api PATCH "/applications/$uuid/envs/bulk" -d "{\"data\": [
    {\"key\": \"OLLAMA_URL\", \"value\": \"http://ollama:11434\"},
    {\"key\": \"MODEL\",      \"value\": \"qwen2.5vl\"}
  ]}" >/dev/null && echo "envs set for $name"
}

create_app po-extract-dev  dev  development po-extract-dev
create_app po-extract-main main production  po-extract-main

cat <<'EOS'

次の手順:
  1. ai-stack をデプロイして ollama を coolify ネットワークへ参加させる
     （coolify/common/deploy-stack.sh ai-stack）— これが無いと抽出できない。
  2. ./deploy.sh po-extract-dev / ./deploy.sh po-extract-main
  3. nextjs-web の PO_EXTRACT_URL を環境ごとに向け直して再デプロイ
       dev  → http://po-extract-dev:8000
       main → http://po-extract-main:8000
EOS
