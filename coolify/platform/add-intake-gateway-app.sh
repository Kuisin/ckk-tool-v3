#!/usr/bin/env bash
# Register the intake-gateway (注文請書 メール取込) app in Coolify (idempotent).
# Run ON docker-mac-pro:  bash ~/stacks/coolify/add-intake-gateway-app.sh
#
# Creates **ONE** app:
#   intake-gateway   環境 common   branch main
#
# **なぜ common に 1 つだけか** — メールアドレスは環境で分けられないから。
# さくらのメールドメインは 1 つで、`order-intake@ckk-tool.co.jp` も 1 つしかない。
# dev と main に 1 つずつ置くと、2 つのゲートウェイが**同じ受信箱を取り合い**、
# どちらか一方でしか取り込まれない（先に既読を打った側が勝つ）。
# 送信側の `mailrelay` が common に 1 つなのと同じ理屈で、受信側もここに置く。
#
# したがって取込先は**本番の取込フォルダ**である。顧客に案内するアドレスなので、
# 届いた注文書は本番の注文請書にならなければ意味がない。
# **dev にメール取込は無い** — dev で試すときは SY0C の投入か
# 取込フォルダへ直接置く（どちらもメールを経由しない同じ経路）。
#
# **内部専用** — ホストポートも公開ドメインもネットワーク別名も無い。
# 誰からも呼ばれない: 外向きに IMAP を張り、取込フォルダへ直接書くだけ。
# DB にも nextjs-web にも触らない（隔離）。
#
# ⚠️ uid/gid — このコンテナは nextjs-web と同じ **1001:1001** で走る
# （Dockerfile 参照）。ホスト側のフォルダもその uid が書ける状態にすること。
# ずれると EACCES で黙って止まり、画面では「取込待ちのまま動かない」としか
# 見えない。

set -euo pipefail

GIT_REPO="https://github.com/Kuisin/ckk-tool-v3"
BASE_DIR="/coolify/apps/intake-gateway"
DOCKERFILE="/Dockerfile"
WATCH_PATHS="coolify/apps/intake-gateway/**"
API="http://127.0.0.1:8000/api/v1"
TOKEN_FILE=/data/coolify/source/.api-token
WEBHOOK_FILE=/data/coolify/source/.webhook-secrets

# 本番の取込フォルダ（nextjs-web-main と同じホストパス）
HOST_DIR="/home/kaiseisawada/intake/orders-main"
NAME="intake-gateway"

TOKEN=$(cat "$TOKEN_FILE")
api() { local m=$1 p=$2; shift 2; curl -sf -X "$m" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json" "$API$p" "$@"; }
api GET /version >/dev/null && echo "API ok"

SERVER_UUID=$(api GET /servers | jq -r '.[0].uuid')
PROJECT_UUID=$(api GET /projects | jq -r '.[] | select(.name == "ckk") | .uuid' | head -1)
[ -n "$PROJECT_UUID" ] || { echo "!! project ckk not found — run setup.sh first"; exit 1; }

uuid=$(api GET /applications | jq -r ".[] | select(.name == \"$NAME\") | .uuid" | head -1)
if [ -z "$uuid" ]; then
  secret=$(openssl rand -hex 20)
  # ports_exposes は必須項目なので形だけ宣言する。ports_mappings は付けない
  # ＝ホストに出ない。autogenerate_domain false ＝ 公開 URL も作らない。
  uuid=$(api POST /applications/public -d "{
    \"project_uuid\": \"$PROJECT_UUID\",
    \"server_uuid\": \"$SERVER_UUID\",
    \"environment_name\": \"common\",
    \"name\": \"$NAME\",
    \"description\": \"CKK 注文請書 メール取込ゲートウェイ — internal only, common/main\",
    \"git_repository\": \"$GIT_REPO\",
    \"git_branch\": \"main\",
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
  echo "$NAME github_webhook_secret=$secret" >> "$WEBHOOK_FILE"; chmod 600 "$WEBHOOK_FILE"
  echo "created $NAME: $uuid"
else
  echo "exists  $NAME: $uuid"
fi

api PATCH "/applications/$uuid" -d "{
  \"base_directory\": \"$BASE_DIR\",
  \"dockerfile_location\": \"$DOCKERFILE\",
  \"watch_paths\": \"$WATCH_PATHS\"
}" >/dev/null && echo "  build settings applied"

if [ "$(api GET "/applications/$uuid/envs" | jq 'length')" != "0" ]; then
  echo "  envs already present — leaving them alone (manage in the Coolify UI)"
else
  # 受信箱の資格情報はここに書かない（このファイルは git に入る）。
  # INTAKE_MAIL_HOST が空の間、ゲートウェイは何もせず待機する。
  api PATCH "/applications/$uuid/envs/bulk" -d "{\"data\": [
    {\"key\": \"INTAKE_DIR\",                \"value\": \"/data/intake\"},
    {\"key\": \"INTAKE_MAIL_HOST\",          \"value\": \"\"},
    {\"key\": \"INTAKE_MAIL_PORT\",          \"value\": \"993\"},
    {\"key\": \"INTAKE_MAIL_SSL\",           \"value\": \"1\"},
    {\"key\": \"INTAKE_MAIL_USER\",          \"value\": \"\"},
    {\"key\": \"INTAKE_MAIL_PASSWORD\",      \"value\": \"\"},
    {\"key\": \"INTAKE_MAIL_BOX\",           \"value\": \"INBOX\"},
    {\"key\": \"INTAKE_MAIL_PROCESSED_BOX\", \"value\": \"Processed\"},
    {\"key\": \"INTAKE_MAIL_FAILED_BOX\",    \"value\": \"Failed\"},
    {\"key\": \"INTAKE_MAIL_POLL_SECONDS\",  \"value\": \"120\"},
    {\"key\": \"INTAKE_MAIL_MAX_MESSAGES\",  \"value\": \"20\"},
    {\"key\": \"INTAKE_MAIL_SINCE_DAYS\",    \"value\": \"7\"},
    {\"key\": \"INTAKE_MAIL_ALLOW_FROM\",    \"value\": \"\"},
    {\"key\": \"PYTHONUNBUFFERED\",          \"value\": \"1\"}
  ]}" >/dev/null && echo "  envs set (資格情報は空 — Coolify の UI で入れる)"
fi

# 取込フォルダのバインドマウント。**nextjs-web-main と同じホストパス**を見る。
# 名前付きボリュームは Coolify が <appUUID>_<name> に改名するのでアプリ間で
# 共有できない。type は persistent|file の 2 択（bind / volume は Validation
# failed）だが、**persistent に host_path を渡すとバインドマウントになる**。
if api GET "/applications/$uuid/storages" \
     | jq -e '.persistent_storages[]? | select(.mount_path == "/data/intake")' >/dev/null 2>&1; then
  echo "  /data/intake は既にマウント済み"
elif api POST "/applications/$uuid/storages" -d "{
        \"type\": \"persistent\",
        \"name\": \"${NAME}-intake\",
        \"host_path\": \"$HOST_DIR\",
        \"mount_path\": \"/data/intake\"
      }" >/dev/null 2>&1; then
  echo "  bind mount attached ($HOST_DIR → /data/intake)"
else
  echo "  !! /data/intake を付けられなかった — **最初のデプロイ前に** UI で付けること:"
  echo "     $NAME → Persistent Storage → Add → Bind mount"
  echo "       Host: $HOST_DIR   Container: /data/intake"
fi

# ── 非公開リポジトリのデプロイキーへ付け替える ─────────────────────────
# **必須。** /applications/public で作ると Coolify 組み込みの擬似ソース
# 「Public GitHub」に紐づき、匿名 HTTPS clone を試みて
#   fatal: could not read Username for 'https://github.com'
# でビルドが落ちる。private_key_id は REST API では設定できないため DB を直接
# 更新する。詳細は coolify/platform/README.md「git アクセスはデプロイキー」。
docker exec -i coolify-db psql -U coolify -d coolify -q <<SQL
update applications
   set git_repository = 'git@github.com:Kuisin/ckk-tool-v3.git',
       private_key_id = 1, source_id = null, source_type = null
 where name = '$NAME'
   and (private_key_id is null or git_repository <> 'git@github.com:Kuisin/ckk-tool-v3.git');
SQL
echo "  private_key_id / git_repository fixed (非公開リポジトリのデプロイキー)"

cat <<EOS

次の手順:
  1. 取込フォルダは **nextjs-web-main と同じ** $HOST_DIR（本番）。
     顧客に案内するアドレスなので、届いた注文書は本番の注文請書になる。
     **dev にメール取込は無い**（SY0C の投入か取込フォルダへ直接置く）。
  2. Coolify UI で受信箱の資格情報を入れる:
       INTAKE_MAIL_HOST=ckk-tool.sakura.ne.jp
       INTAKE_MAIL_USER=order-intake@ckk-tool.co.jp
       INTAKE_MAIL_PASSWORD=（/data/coolify/source/.intake-mailbox）
  3. ./deploy.sh intake-gateway
  4. docker logs -f で確認する:
       「メール取込を開始します」 … 正常
       「メール取込は無効です（…）」 … env が足りない（理由が出る）
       「取込フォルダが使えません」 … uid/gid かマウント
EOS
