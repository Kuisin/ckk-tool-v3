#!/usr/bin/env bash
# Trigger a Coolify deployment from the workstation.
#
#   ./deploy.sh dev              deploy latest dev branch (nextjs-web)
#   ./deploy.sh main             deploy latest main branch (production nextjs-web)
#   ./deploy.sh main <sha>       redeploy a specific commit (rollback/pin)
#   ./deploy.sh admin-dev        deploy admintools dev  (admin-dev.ckk-tool.co.jp:8090)
#   ./deploy.sh admin-main       deploy admintools prod (admin.ckk-tool.co.jp:8091)
#   ./deploy.sh admin-main <sha> pin/rollback admintools prod to a commit
#
# Uses the server-side API token; nothing secret leaves the server.

set -euo pipefail

TARGET=${1:?usage: deploy.sh dev|main|admin-dev|admin-main [git-sha]}
SHA=${2:-}
case "$TARGET" in
  dev)                    APP_NAME=nextjs-web-dev ;;
  main)                   APP_NAME=nextjs-web-main ;;
  admin-dev|admintools)   APP_NAME=admintools-dev ;;
  admin-main|admintools-main) APP_NAME=admintools-main ;;
  *) echo "unknown target: $TARGET (dev|main|admin-dev|admin-main)"; exit 1 ;;
esac

ssh 192.168.50.15 bash -s -- "$APP_NAME" "$SHA" <<'EOS'
set -euo pipefail
APP_NAME=$1; SHA=${2:-}
API="http://127.0.0.1:8000/api/v1"
TOKEN=$(cat /data/coolify/source/.api-token)
api() { local m=$1 p=$2; shift 2; curl -sf -X "$m" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "$API$p" "$@"; }

UUID=$(api GET /applications | jq -r ".[] | select(.name == \"$APP_NAME\") | .uuid" | head -1)
[ -n "$UUID" ] || { echo "app not found: $APP_NAME"; exit 1; }

if [ -n "$SHA" ]; then
  api PATCH "/applications/$UUID" -d "{\"git_commit_sha\": \"$SHA\"}" >/dev/null
  echo "pinned $APP_NAME to $SHA"
fi

api GET "/deploy?uuid=$UUID" | jq -r '.deployments[0].message // .message // "queued"'
while :; do
  S=$(api GET "/deployments/applications/$UUID" | jq -r '.deployments[0].status // "unknown"')
  printf '\r%s: %-12s' "$APP_NAME" "$S"
  case "$S" in finished) echo; break ;; failed|cancelled) echo; exit 1 ;; esac
  sleep 10
done
EOS
