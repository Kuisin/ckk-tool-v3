#!/usr/bin/env bash
# Trigger a Coolify deployment from the workstation.
#
#   ./deploy.sh dev              deploy latest dev branch (nextjs-web)
#   ./deploy.sh main             deploy latest main branch (production nextjs-web)
#   ./deploy.sh main <sha>       redeploy a specific commit (rollback/pin)
#   ./deploy.sh admin-dev        deploy admintools dev  (admin-dev.ckk-tool.co.jp:8090)
#   ./deploy.sh admin-main       deploy admintools prod (admin.ckk-tool.co.jp:8091)
#   ./deploy.sh admin-main <sha> pin/rollback admintools prod to a commit
#   ./deploy.sh kiosk-dev        deploy nextjs-kiosk dev  (ckk-kiosk-dev.kai-lab.net:3006)
#   ./deploy.sh kiosk-main       deploy nextjs-kiosk prod (ckk-kiosk.kai-lab.net:3007)
#   ./deploy.sh po-extract-dev   deploy po-extract dev  (internal only — 公開ポート無し)
#   ./deploy.sh po-extract-main  deploy po-extract prod (internal only — 公開ポート無し)
#   ./deploy.sh db-migrate-dev   apply DB migrations to ckk-db-dev  (通常は push で自動)
#   ./deploy.sh db-migrate-main  apply DB migrations to ckk-db-main (通常は push で自動)
#   ./deploy.sh ckk-db-dev       ⚠ DB コンテナを作り直す（イメージ更新時のみ）
#   ./deploy.sh ckk-db-main      ⚠ 同上・本番
#
# ⚠ ckk-db-* はデータベース本体。自動デプロイは切ってあり、ここから明示的に
#   流したときだけ再作成される。永続ボリュームが付いていることを確認してから。
#
# Uses the server-side API token; nothing secret leaves the server.

set -euo pipefail

USAGE="usage: deploy.sh dev|main|admin-dev|admin-main|kiosk-dev|kiosk-main|po-extract-dev|po-extract-main|db-migrate-dev|db-migrate-main|ckk-db-dev|ckk-db-main [git-sha]"
TARGET=${1:?$USAGE}
SHA=${2:-}
case "$TARGET" in
  dev)                    APP_NAME=nextjs-web-dev ;;
  main)                   APP_NAME=nextjs-web-main ;;
  admin-dev|admintools)   APP_NAME=admintools-dev ;;
  admin-main|admintools-main) APP_NAME=admintools-main ;;
  kiosk-dev)              APP_NAME=nextjs-kiosk-dev ;;
  kiosk-main)             APP_NAME=nextjs-kiosk-main ;;
  po-extract-dev)         APP_NAME=po-extract-dev ;;
  po-extract-main)        APP_NAME=po-extract-main ;;
  db-migrate-dev)         APP_NAME=db-migrate-dev ;;
  db-migrate-main)        APP_NAME=db-migrate-main ;;
  ckk-db-dev|ckk-db-main) APP_NAME=$TARGET ;;
  *) echo "unknown target: $TARGET"; echo "$USAGE"; exit 1 ;;
esac

case "$TARGET" in
  ckk-db-*)
    echo "⚠  $APP_NAME はデータベース本体です。再デプロイでコンテナが作り直されます。"
    echo "   永続ボリューム（/var/lib/postgresql/data）が付いていることを確認しましたか？"
    printf "   続けるには 'yes' と入力: "
    read -r confirm
    [ "$confirm" = "yes" ] || { echo "中止しました"; exit 1; }
    ;;
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
