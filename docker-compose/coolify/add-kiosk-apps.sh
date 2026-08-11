#!/usr/bin/env bash
# Register the nextjs-kiosk apps in Coolify (idempotent).
# Run ON docker-mac-pro:  bash ~/stacks/coolify/add-kiosk-apps.sh
# (or from the workstation: ssh 192.168.50.15 'bash ~/stacks/coolify/add-kiosk-apps.sh')
#
# Creates (mirroring setup.sh's create_app, admintools precedent):
#   nextjs-kiosk-dev   branch dev   host :3006   env development
#   nextjs-kiosk-main  branch main  host :3007   env production
# with watch_paths docker-compose/nextjs-kiosk/**, and seeds envs:
#   DATABASE_URL / NODE_ENV / NEXT_PUBLIC_APP_VERSION / KIOSK_WS_SECRET
# KIOSK_WS_SECRET is generated once into /data/coolify/source/.kiosk-ws-secret
# and ALSO added to the nextjs-web apps (dev/main) together with
# NEXT_PUBLIC_KIOSK_WS_URL so the admin UI can open monitor WS connections.

set -euo pipefail

GIT_REPO="https://github.com/Kuisin/ckk-tool-v3"
BASE_DIR="/docker-compose/nextjs-kiosk"
API="http://127.0.0.1:8000/api/v1"
TOKEN_FILE=/data/coolify/source/.api-token
WEBHOOK_FILE=/data/coolify/source/.webhook-secrets
SECRET_FILE=/data/coolify/source/.kiosk-ws-secret
DEV_PORT=3006
MAIN_PORT=3007
DEV_WS_URL="wss://ckk-kiosk-dev.kai-lab.net/api/kiosk/ws"
MAIN_WS_URL="wss://ckk-kiosk.kai-lab.net/api/kiosk/ws"

TOKEN=$(cat "$TOKEN_FILE")
api() { local m=$1 p=$2; shift 2; curl -sf -X "$m" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json" "$API$p" "$@"; }
api GET /version >/dev/null && echo "API ok"

SERVER_UUID=$(api GET /servers | jq -r '.[0].uuid')
PROJECT_UUID=$(api GET /projects | jq -r '.[] | select(.name == "ckk") | .uuid' | head -1)
[ -n "$PROJECT_UUID" ] || { echo "!! project ckk not found — run setup.sh first"; exit 1; }

# 共有シークレット（両アプリで同値）— 初回のみ生成
if [ ! -s "$SECRET_FILE" ]; then
  openssl rand -hex 32 > "$SECRET_FILE"
  chmod 600 "$SECRET_FILE"
  echo "generated $SECRET_FILE"
fi
KIOSK_WS_SECRET=$(cat "$SECRET_FILE")

set -a; . ~/stacks/nextjs-web/.env; set +a
DATABASE_URL="postgresql://app:${APP_DB_PASSWORD}@shared-db:5432/ckk"

create_app() { # name branch host_port env_name
  local name=$1 branch=$2 port=$3 env_name=$4 uuid secret
  uuid=$(api GET /applications | jq -r ".[] | select(.name == \"$name\") | .uuid" | head -1)
  if [ -z "$uuid" ]; then
    secret=$(openssl rand -hex 20)
    uuid=$(api POST /applications/public -d "{
      \"project_uuid\": \"$PROJECT_UUID\",
      \"server_uuid\": \"$SERVER_UUID\",
      \"environment_name\": \"$env_name\",
      \"name\": \"$name\",
      \"description\": \"CKK nextjs-kiosk ($branch)\",
      \"git_repository\": \"$GIT_REPO\",
      \"git_branch\": \"$branch\",
      \"build_pack\": \"dockerfile\",
      \"base_directory\": \"$BASE_DIR\",
      \"dockerfile_location\": \"/Dockerfile\",
      \"ports_exposes\": \"3000\",
      \"ports_mappings\": \"$port:3000\",
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
  api PATCH "/applications/$uuid" -d "{\"watch_paths\": \"${BASE_DIR#/}/**\"}" >/dev/null \
    && echo "watch_paths set for $name"
  if [ "$(api GET "/applications/$uuid/envs" | jq 'length')" != "0" ]; then
    echo "envs already present for $name — skipping (manage in Coolify UI)"
    return 0
  fi
  api PATCH "/applications/$uuid/envs/bulk" -d "{\"data\": [
    {\"key\": \"NODE_ENV\",                \"value\": \"production\"},
    {\"key\": \"DATABASE_URL\",            \"value\": \"$DATABASE_URL\"},
    {\"key\": \"KIOSK_WS_SECRET\",         \"value\": \"$KIOSK_WS_SECRET\"},
    {\"key\": \"NEXT_PUBLIC_APP_VERSION\", \"value\": \"${NEXT_PUBLIC_APP_VERSION:-0.1.0}\"}
  ]}" >/dev/null && echo "envs set for $name"
}

create_app nextjs-kiosk-dev  dev  "$DEV_PORT"  development
create_app nextjs-kiosk-main main "$MAIN_PORT" production

# nextjs-web 側（管理 UI）に KIOSK_WS_SECRET / NEXT_PUBLIC_KIOSK_WS_URL を追加
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

add_env_if_missing nextjs-web-dev  KIOSK_WS_SECRET          "$KIOSK_WS_SECRET"
add_env_if_missing nextjs-web-dev  NEXT_PUBLIC_KIOSK_WS_URL "$DEV_WS_URL"
add_env_if_missing nextjs-web-main KIOSK_WS_SECRET          "$KIOSK_WS_SECRET"
add_env_if_missing nextjs-web-main NEXT_PUBLIC_KIOSK_WS_URL "$MAIN_WS_URL"

echo
echo "done. deploy with: ./deploy.sh kiosk-dev / ./deploy.sh kiosk-main"
echo "(nextjs-web apps need a redeploy to pick up the new envs)"
