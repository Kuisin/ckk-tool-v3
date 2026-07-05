#!/usr/bin/env bash
# One-shot (idempotent) Coolify bootstrap for the CKK nextjs-web migration.
# Run ON docker-mac-pro as kaiseisawada:  bash ~/stacks/coolify/setup.sh
#
# Prereqs already in place (rsynced from the repo / created at install time):
#   - coolify stack running (~/stacks/coolify, UI on :8000)
#   - /data/coolify/source/.env with ROOT_USERNAME/ROOT_USER_EMAIL/ROOT_USER_PASSWORD
#   - SSH keypair /data/coolify/ssh/keys/id.kaiseisawada@host.docker.internal
#   - ~/stacks/nextjs-web/docker-compose.next.yml (relay/infra compose, staged)
#
# What it does:
#   1. authorizes Coolify's SSH key for kaiseisawada (host management)
#   2. attaches shared-db / po-extract / gotenberg / seaweedfs to the coolify network
#   3. seeds the Coolify root user from .env (RootUserSeeder)
#   4. enables the API, disables self-registration
#   5. creates an API token -> /data/coolify/source/.api-token
#   6. registers project `ckk` and two apps built from github.com/Kuisin/ckk-tool-v3:
#        nextjs-web-dev   branch dev   host :3004
#        nextjs-web-main  branch main  host :3005
#   7. deploys dev, waits for the build, smoke-tests :3004
#   8. cuts the nextjs-web stack over to the relay compose (web -> :3004)
#   9. deploys main (prod pipeline validation), smoke-tests :3005

set -euo pipefail

GIT_REPO="https://github.com/Kuisin/ckk-tool-v3"
BASE_DIR="/docker-compose/nextjs-web"
API="http://127.0.0.1:8000/api/v1"
TOKEN_FILE=/data/coolify/source/.api-token
WEBHOOK_FILE=/data/coolify/source/.webhook-secrets
KEY_PUB="/data/coolify/ssh/keys/id.kaiseisawada@host.docker.internal.pub"
DEV_PORT=3004
MAIN_PORT=3005

step() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }

step "0/9 Preflight"
# Coolify manages this host over SSH as kaiseisawada (non-root) and needs
# passwordless sudo (validation and helper commands run `sudo ...`):
#   echo 'kaiseisawada ALL=(ALL) NOPASSWD: ALL' | sudo tee /etc/sudoers.d/kaiseisawada-coolify
#   sudo chmod 440 /etc/sudoers.d/kaiseisawada-coolify
if ! sudo -n true 2>/dev/null; then
  echo "!! passwordless sudo is not configured for $USER — run the two commands"
  echo "   in the comment above (once, with your password), then re-run this script."
  exit 1
fi
echo "passwordless sudo ok"

step "0b/9 Root password policy check (min 8, mixed case, number, symbol)"
# RootUserSeeder validates the password; regenerate server-side if it would fail.
CURRENT_PW=$(grep '^ROOT_USER_PASSWORD=' /data/coolify/source/.env | cut -d= -f2-)
if ! printf '%s' "$CURRENT_PW" | grep -q '[^A-Za-z0-9]' || [ "${#CURRENT_PW}" -lt 8 ]; then
  NEW_PW="Ckk9!$(openssl rand -base64 18 | tr -d '/+=')"
  sed -i "s|^ROOT_USER_PASSWORD=.*|ROOT_USER_PASSWORD=$NEW_PW|" /data/coolify/source/.env
  echo "regenerated ROOT_USER_PASSWORD in /data/coolify/source/.env (kept server-only)"
  ( cd ~/stacks/coolify && docker compose up -d )
  until curl -sf http://127.0.0.1:8000/api/health >/dev/null; do sleep 3; done
else
  echo "password ok"
fi

step "1/9 Authorize Coolify host-management SSH key"
mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
# Coolify imports the seeded private key into its DB and rewrites the keys dir
# with its own naming (ssh_key@<id>), so derive the pubkey from Coolify's own
# key store inside the container.
PUB=$(docker exec coolify sh -c 'for f in /var/www/html/storage/app/ssh/keys/ssh_key@*; do case "$f" in *.lock) ;; *) ssh-keygen -y -f "$f" && break ;; esac; done')
[ -n "$PUB" ] || { echo "!! could not derive Coolify public key"; exit 1; }
grep -qxF "$PUB" ~/.ssh/authorized_keys || printf '%s\n' "$PUB" >> ~/.ssh/authorized_keys
echo "authorized"

step "2/9 Attach shared services to the coolify network"
for c in shared-db po-extract nextjs-gotenberg nextjs-seaweedfs; do
  docker network connect coolify "$c" 2>/dev/null && echo "connected: $c" || echo "already connected: $c"
done

step "3/9 Seed Coolify root user (from /data/coolify/source/.env)"
docker exec coolify php artisan db:seed --class=RootUserSeeder --force
docker exec coolify php artisan tinker --execute='echo App\Models\User::count() . " user(s)";'

step "4/9 Enable API, disable self-registration"
docker exec coolify php artisan tinker --execute='$s = App\Models\InstanceSettings::get(); $s->is_api_enabled = true; $s->is_registration_enabled = false; $s->save(); echo "api enabled";'

step "5/9 API token"
if ! grep -qE '^[0-9]+\|[A-Za-z0-9]{20,}$' "$TOKEN_FILE" 2>/dev/null; then
  # createToken reads the team from the session; set it explicitly (tinker has none).
  docker exec coolify php artisan tinker --execute='session(["currentTeam" => App\Models\Team::find(0)]); $u = App\Models\User::find(0); echo $u->createToken("ckk-automation", ["root"])->plainTextToken;' | grep -E '^[0-9]+\|[A-Za-z0-9]{20,}$' | tail -1 > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
  grep -qE '^[0-9]+\|' "$TOKEN_FILE" || { echo "!! token creation failed"; exit 1; }
fi
TOKEN=$(cat "$TOKEN_FILE")
api() { local method=$1 path=$2; shift 2; curl -sf -X "$method" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json" "$API$path" "$@"; }
api GET /version >/dev/null && echo "API ok"

step "6/9 Server + project"
SERVER_UUID=$(api GET /servers | jq -r '.[0].uuid')
echo "server: $SERVER_UUID"
server_ok() { api GET "/servers/$SERVER_UUID" | jq -e '.settings.is_reachable == true and .settings.is_usable == true' >/dev/null; }
if ! server_ok; then
  api GET "/servers/$SERVER_UUID/validate" >/dev/null 2>&1 || true
  started=$(date +%s)
  until server_ok; do
    [ $(( $(date +%s) - started )) -gt 180 ] && { echo "!! server validation timed out"; api GET "/servers/$SERVER_UUID" | jq '.settings | {is_reachable, is_usable}'; exit 1; }
    sleep 5
  done
fi
echo "server validated (reachable + usable)"
PROJECT_UUID=$(api GET /projects | jq -r '.[] | select(.name == "ckk") | .uuid' | head -1)
if [ -z "$PROJECT_UUID" ]; then
  PROJECT_UUID=$(api POST /projects -d '{"name":"ckk","description":"CKK business management system"}' | jq -r '.uuid')
fi
echo "project: $PROJECT_UUID"

# App env vars come from the existing stack .env (APP_DB_PASSWORD, NEXT_PUBLIC_APP_VERSION)
set -a; . ~/stacks/nextjs-web/.env; set +a
DATABASE_URL="postgresql://app:${APP_DB_PASSWORD}@shared-db:5432/ckk"

create_app() { # name branch host_port
  local name=$1 branch=$2 port=$3 uuid secret
  uuid=$(api GET /applications | jq -r ".[] | select(.name == \"$name\") | .uuid" | head -1)
  if [ -z "$uuid" ]; then
    secret=$(openssl rand -hex 20)
    uuid=$(api POST /applications/public -d "{
      \"project_uuid\": \"$PROJECT_UUID\",
      \"server_uuid\": \"$SERVER_UUID\",
      \"environment_name\": \"production\",
      \"name\": \"$name\",
      \"description\": \"CKK nextjs-web ($branch)\",
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
  # envs/bulk appends rather than upserts — only seed envs once (empty set).
  if [ "$(api GET "/applications/$uuid/envs" | jq 'length')" != "0" ]; then
    echo "envs already present for $name — skipping (manage in Coolify UI)"
    eval "${4}=$uuid"
    return 0
  fi
  api PATCH "/applications/$uuid/envs/bulk" -d "{\"data\": [
    {\"key\": \"NODE_ENV\",               \"value\": \"production\"},
    {\"key\": \"DATABASE_URL\",           \"value\": \"$DATABASE_URL\"},
    {\"key\": \"GOTENBERG_URL\",          \"value\": \"http://gotenberg:3000\"},
    {\"key\": \"SEAWEED_FILER_URL\",      \"value\": \"http://seaweedfs:8888\"},
    {\"key\": \"PO_EXTRACT_URL\",         \"value\": \"http://po-extract:8000\"},
    {\"key\": \"NEXT_PUBLIC_APP_VERSION\",\"value\": \"${NEXT_PUBLIC_APP_VERSION:-0.1.0}\"}
  ]}" >/dev/null && echo "envs set for $name"
  eval "${4}=$uuid"
}

step "7/9 Applications"
create_app nextjs-web-dev  dev  "$DEV_PORT"  DEV_UUID
create_app nextjs-web-main main "$MAIN_PORT" MAIN_UUID

deploy_and_wait() { # uuid label port
  local uuid=$1 label=$2 port=$3 status started
  api GET "/deploy?uuid=$uuid" >/dev/null || api POST "/deploy?uuid=$uuid" >/dev/null || true
  started=$(date +%s)
  while :; do
    status=$(api GET "/deployments/applications/$uuid" | jq -r '.deployments[0].status // "unknown"')
    printf '\r%s deployment: %-12s (%ss elapsed)' "$label" "$status" "$(( $(date +%s) - started ))"
    case "$status" in
      finished) echo; break ;;
      failed|cancelled)
        echo; echo "!! $label deployment $status — last log lines:"
        api GET "/deployments/applications/$uuid" | jq -r '.deployments[0].logs' | jq -r '.[] | select(.hidden != true) | .output' 2>/dev/null | tail -30 || true
        return 1 ;;
    esac
    [ $(( $(date +%s) - started )) -gt 2400 ] && { echo; echo "!! timeout"; return 1; }
    sleep 10
  done
  sleep 3
  curl -sf -o /dev/null "http://127.0.0.1:$port/" && echo "$label responds on :$port" || { echo "!! $label not responding on :$port"; return 1; }
}

step "8/9 Deploy dev + cut over"
deploy_and_wait "$DEV_UUID" dev "$DEV_PORT"
cd ~/stacks/nextjs-web
if [ -f docker-compose.next.yml ]; then
  [ -f docker-compose.yml ] && cp docker-compose.yml "docker-compose.yml.pre-coolify.$(date +%Y%m%d%H%M%S)"
  mv docker-compose.next.yml docker-compose.yml
fi
docker compose up -d --remove-orphans
sleep 3
docker run --rm --network nextjs-web_default curlimages/curl:8.10.1 -sf -o /dev/null http://web:3000/ \
  && echo "relay web:3000 -> :$DEV_PORT OK (dev.kai-lab.net unchanged)" \
  || echo "!! relay check failed — inspect: docker logs web-relay-dev"

step "9/9 Deploy main (prod pipeline validation)"
deploy_and_wait "$MAIN_UUID" main "$MAIN_PORT" || echo "(main build failure is non-blocking for dev; fix at next promotion)"

step "Done"
cat <<EOF

Coolify UI:      http://192.168.50.15:8000  (root user in /data/coolify/source/.env)
API token:       $TOKEN_FILE
Webhook secrets: $WEBHOOK_FILE (for GitHub push auto-deploy once Coolify is
                 publicly reachable, e.g. coolify.kai-lab.net via cloudflared)
Apps:            nextjs-web-dev  :$DEV_PORT  <- web relay (dev.kai-lab.net)
                 nextjs-web-main :$MAIN_PORT <- web-main relay (v*.ckk.kai-lab.net)
Rollback (main): Coolify UI -> nextjs-web-main -> Deployments -> pick a previous
                 successful build -> Redeploy (images are kept per deployment).
EOF
