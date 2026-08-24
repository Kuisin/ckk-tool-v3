#!/usr/bin/env bash
# Register the per-environment database + migrator apps in Coolify (idempotent).
# Run ON docker-mac-pro:  bash ~/stacks/coolify/add-db-apps.sh
# (or from the workstation: ssh 192.168.50.15 'bash ~/stacks/coolify/add-db-apps.sh')
#
# Creates four internal-only applications:
#   ckk-db-dev       branch dev   環境 development  alias ckk-db-dev
#   ckk-db-main      branch main  環境 production   alias ckk-db-main
#   db-migrate-dev   branch dev   環境 development  → ckk-db-dev
#   db-migrate-main  branch main  環境 production   → ckk-db-main
#
# これで **dev と本番はデータベースを共有しない**（これまでは 1 台の shared-db を
# 両方が使っていた）。ファイルストレージ（seaweedfs-dev / seaweedfs-main）も
# nextjs-web スタック側で分けてある。
#
# ■ DB アプリは自動デプロイしない（is_auto_deploy_enabled=false）
#   push のたびに DB コンテナが作り直されるのは事故のもと。イメージを更新したい
#   ときだけ ./deploy.sh ckk-db-dev のように明示的に流す。
#
# ■ migrator は自動デプロイする（watch_paths = shared-db/**）
#   dev / main へマージ → Coolify が再ビルド → コンテナ起動時に
#   `prisma migrate deploy` → grants.sql → kiosk-cron.sql → analytics-views.sql。
#   どれか失敗するとコンテナは healthy にならず、デプロイが失敗として残る。
#
# ■ 永続ボリューム
#   DB の data ディレクトリは Coolify の Persistent Storage で
#   /var/lib/postgresql/data に付ける（`type: persistent`）。失敗したら UI で
#   付ける（下の案内を参照）。**これを忘れたまま再デプロイするとデータが消える。**
#
# ■ Coolify のヘルスチェックは切る（health_check_enabled=false）
#   Coolify の内蔵チェックは公開ポートへの HTTP GET なので Postgres には通じず、
#   `invalid length of startup packet` を吐いて「not healthy」→ ロールバックで
#   デプロイが失敗する（実際に踏んだ）。migrator も HTTP を持たない。
#   代わりに **イメージ側の HEALTHCHECK** を使う:
#     ckk-db     → pg_isready
#     db-migrate → /tmp/migrate-ok の有無（= マイグレーションが通ったか）
#   Coolify はコンテナの health 状態を見てロールバックするので、
#   「マイグレーション失敗＝デプロイ失敗」は保たれる。

set -euo pipefail

GIT_REPO="https://github.com/Kuisin/ckk-tool-v3"
API="http://127.0.0.1:8000/api/v1"
TOKEN_FILE=/data/coolify/source/.api-token
WEBHOOK_FILE=/data/coolify/source/.webhook-secrets
DB_PW_FILE=/data/coolify/source/.ckk-db-passwords

TOKEN=$(cat "$TOKEN_FILE")
api() { local m=$1 p=$2; shift 2; curl -sf -X "$m" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json" "$API$p" "$@"; }
api GET /version >/dev/null && echo "API ok"

SERVER_UUID=$(api GET /servers | jq -r '.[0].uuid')
PROJECT_UUID=$(api GET /projects | jq -r '.[] | select(.name == "ckk") | .uuid' | head -1)
[ -n "$PROJECT_UUID" ] || { echo "!! project ckk not found — run setup.sh first"; exit 1; }

# ── passwords ────────────────────────────────────────────────────────────────
# 環境ごとに別のパスワードを 1 度だけ生成して保存する（dev と本番で使い回さない）。
# 既にファイルがあればそれを使う ＝ 再実行しても同じ値に収束する。
if [ ! -f "$DB_PW_FILE" ]; then
  : > "$DB_PW_FILE"; chmod 600 "$DB_PW_FILE"
  for env_key in DEV MAIN; do
    for role in POSTGRES KOT LDAP_SYNC ADMINTOOLS APP KOT_RO METABASE_RO FX STUDIO_RO BACKUP; do
      echo "${env_key}_${role}_PASSWORD=$(openssl rand -hex 24)" >> "$DB_PW_FILE"
    done
  done
  echo "generated database passwords → $DB_PW_FILE (keep off the repo; back it up)"
fi
# shellcheck disable=SC1090
. "$DB_PW_FILE"

pw() { # env_upper role_upper
  eval "printf '%s' \"\$${1}_${2}_PASSWORD\""
}

create_app() { # name branch env_name base_dir dockerfile ports watch alias description
  local name=$1 branch=$2 env_name=$3 base_dir=$4 dockerfile=$5 ports=$6 watch=$7 alias=$8 desc=$9
  local auto=${10} uuid secret
  uuid=$(api GET /applications | jq -r ".[] | select(.name == \"$name\") | .uuid" | head -1)
  if [ -z "$uuid" ]; then
    secret=$(openssl rand -hex 20)
    uuid=$(api POST /applications/public -d "{
      \"project_uuid\": \"$PROJECT_UUID\",
      \"server_uuid\": \"$SERVER_UUID\",
      \"environment_name\": \"$env_name\",
      \"name\": \"$name\",
      \"description\": \"$desc\",
      \"git_repository\": \"$GIT_REPO\",
      \"git_branch\": \"$branch\",
      \"build_pack\": \"dockerfile\",
      \"base_directory\": \"$base_dir\",
      \"dockerfile_location\": \"$dockerfile\",
      \"ports_exposes\": \"$ports\",
      \"autogenerate_domain\": false,
      \"health_check_enabled\": false,
      \"is_auto_deploy_enabled\": $auto,
      \"manual_webhook_secret_github\": \"$secret\",
      \"instant_deploy\": false
    }" | jq -r '.uuid')
    echo "$name github_webhook_secret=$secret" >> "$WEBHOOK_FILE"; chmod 600 "$WEBHOOK_FILE"
    echo "created $name: $uuid"
  else
    echo "exists  $name: $uuid"
  fi

  local patch="{
    \"base_directory\": \"$base_dir\",
    \"dockerfile_location\": \"$dockerfile\",
    \"watch_paths\": \"$watch\",
    \"is_auto_deploy_enabled\": $auto"
  [ -n "$alias" ] && patch="$patch, \"custom_network_aliases\": \"$alias\""
  patch="$patch }"
  api PATCH "/applications/$uuid" -d "$patch" >/dev/null && echo "  build settings applied${alias:+ (alias $alias)}"

  APP_UUID="$uuid"
}

set_envs() { # uuid name json_data
  local uuid=$1 name=$2 data=$3
  if [ "$(api GET "/applications/$uuid/envs" | jq 'length')" != "0" ]; then
    echo "  envs already present for $name — leaving them alone (manage in the UI)"
    return 0
  fi
  api PATCH "/applications/$uuid/envs/bulk" -d "{\"data\": $data}" >/dev/null \
    && echo "  envs set for $name"
}

add_volume() { # uuid name
  local uuid=$1 name=$2
  # 既に付いていれば何もしない（重複マウントを作らない）。
  if api GET "/applications/$uuid/storages" \
       | jq -e '.persistent_storages[]? | select(.mount_path == "/var/lib/postgresql/data")' >/dev/null 2>&1; then
    echo "  persistent volume already attached"
    return 0
  fi
  # type は persistent | file の 2 択（Coolify v4 の create_storage バリデーション）。
  if api POST "/applications/$uuid/storages" -d "{
        \"type\": \"persistent\",
        \"name\": \"${name}-data\",
        \"mount_path\": \"/var/lib/postgresql/data\"
      }" >/dev/null 2>&1; then
    echo "  persistent volume attached (${name}-data → /var/lib/postgresql/data)"
  else
    echo "  !! could not attach the volume via API — do it in the Coolify UI:"
    echo "     $name → Persistent Storage → Add → name ${name}-data,"
    echo "     mount /var/lib/postgresql/data  … BEFORE the first deploy"
  fi
}

db_envs() { # ENV_UPPER
  local e=$1
  cat <<EOF
[
  {"key": "POSTGRES_DB",              "value": "ckk"},
  {"key": "POSTGRES_USER",            "value": "postgres"},
  {"key": "POSTGRES_PASSWORD",        "value": "$(pw "$e" POSTGRES)"},
  {"key": "KOT_DB_PASSWORD",          "value": "$(pw "$e" KOT)"},
  {"key": "LDAP_SYNC_DB_PASSWORD",    "value": "$(pw "$e" LDAP_SYNC)"},
  {"key": "ADMINTOOLS_DB_PASSWORD",   "value": "$(pw "$e" ADMINTOOLS)"},
  {"key": "APP_DB_PASSWORD",          "value": "$(pw "$e" APP)"},
  {"key": "KOT_RO_DB_PASSWORD",       "value": "$(pw "$e" KOT_RO)"},
  {"key": "METABASE_RO_DB_PASSWORD",  "value": "$(pw "$e" METABASE_RO)"},
  {"key": "FX_DB_PASSWORD",           "value": "$(pw "$e" FX)"},
  {"key": "STUDIO_RO_DB_PASSWORD",    "value": "$(pw "$e" STUDIO_RO)"},
  {"key": "BACKUP_DB_PASSWORD",       "value": "$(pw "$e" BACKUP)"}
]
EOF
}

# ── database apps (no auto-deploy) ───────────────────────────────────────────
create_app ckk-db-dev dev development \
  "/coolify/apps/ckk-db" "/Dockerfile" "5432" "coolify/apps/ckk-db/**" \
  "ckk-db-dev" "CKK business database (dev) — internal only" false
set_envs "$APP_UUID" ckk-db-dev "$(db_envs DEV)"
add_volume "$APP_UUID" ckk-db-dev

create_app ckk-db-main main production \
  "/coolify/apps/ckk-db" "/Dockerfile" "5432" "coolify/apps/ckk-db/**" \
  "ckk-db-main" "CKK business database (production) — internal only" false
set_envs "$APP_UUID" ckk-db-main "$(db_envs MAIN)"
add_volume "$APP_UUID" ckk-db-main

# ── migrator apps (auto-deploy on shared-db/** changes) ──────────────────────
# build context はリポジトリルート（shared-db/ を COPY するため）。
create_app db-migrate-dev dev development \
  "/" "/coolify/apps/db-migrate/Dockerfile" "0" "shared-db/**" \
  "" "Applies DB migrations to ckk-db-dev on every push" true
set_envs "$APP_UUID" db-migrate-dev \
  "[{\"key\": \"DATABASE_URL\", \"value\": \"postgresql://postgres:$(pw DEV POSTGRES)@ckk-db-dev:5432/ckk\"}]"

create_app db-migrate-main main production \
  "/" "/coolify/apps/db-migrate/Dockerfile" "0" "shared-db/**" \
  "" "Applies DB migrations to ckk-db-main on every push" true
set_envs "$APP_UUID" db-migrate-main \
  "[{\"key\": \"DATABASE_URL\", \"value\": \"postgresql://postgres:$(pw MAIN POSTGRES)@ckk-db-main:5432/ckk\"}]"

cat <<'EOS'

次の手順:
  1. 各 ckk-db-* に永続ボリュームが付いていることを UI で確認する
     （付け忘れたまま再デプロイするとデータが消える）
  2. ./deploy.sh ckk-db-dev  → 起動して init/01-roles.sh がロールを作る
     ./deploy.sh db-migrate-dev → migration + grants + cron + analytics
  3. dev のデータを移す（旧 shared-db から）:
       ssh 192.168.50.15 'docker exec shared-db pg_dump -U postgres -d ckk -Fc -N cron' > /tmp/ckk.dump
       # ckk-db-dev のコンテナへ pg_restore --no-owner
       # そのあと _prisma_migrations を TRUNCATE して 9 本を resolve --applied
       # （shared-db/README.md「既存 DB を新しい履歴に合わせ直すとき」）
  4. nextjs-web-dev / nextjs-kiosk-dev の env を向け直して再デプロイ:
       DATABASE_URL      → postgresql://app:<APP_DB_PASSWORD>@ckk-db-dev:5432/ckk
       SEAWEED_FILER_URL → http://seaweedfs-dev:8888
       GOTENBERG_URL     → http://gotenberg-dev:3000
  5. dev の確認が済んでから main 側を同じ手順で（本番 DB は移行ではなく新規:
     migration がマスタ・権限・フラグを入れる。素材/拠点/不良種類/承認フローは
     運用に合わせて画面から作る）
  6. パスワードは /data/coolify/source/.ckk-db-passwords にある。サーバー外に
     バックアップすること（db-backup の secrets スナップショットにも入る）
EOS
