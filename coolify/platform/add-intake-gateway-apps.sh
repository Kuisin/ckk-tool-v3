#!/usr/bin/env bash
# Register the intake-gateway (注文請書 メール取込) apps in Coolify (idempotent).
# Run ON docker-mac-pro:  bash ~/stacks/coolify/add-intake-gateway-apps.sh
# (or: ssh 192.168.50.15 'bash ~/stacks/coolify/add-intake-gateway-apps.sh')
#
# Creates (mirroring add-po-extract-apps.sh):
#   intake-gateway-dev   branch dev   環境 development
#   intake-gateway-main  branch main  環境 production
#
# **内部専用** — ホストポートも公開ドメインも無く、ネットワーク別名も要らない。
# 誰からも呼ばれないから: 外向きに IMAP を張り、取込フォルダへ**直接書く**だけ。
# DB にも nextjs-web にも触らない（これが隔離の中身 — 一番汚れた入力を扱う
# プロセスに、アプリのトークンも DB 接続も渡さない）。
#
# ⚠️ **取込フォルダは手で付ける必要がある。**
# Coolify は名前付きボリュームを `<appUUID>_<name>` に改名するので、
# **アプリ間で共有できない**。nextjs-web と同じフォルダを見せるには
# ホストのバインドマウント（dev は実測で
# /home/kaiseisawada/intake/orders → /data/intake）にすること。
# /storages の type は persistent|file の 2 択だが、**persistent に host_path を
# 渡すとバインドマウントになる**ので、このスクリプトが自動で付ける。
#
# ⚠️ uid/gid — このコンテナは nextjs-web と同じ **1001:1001** で走る
# （Dockerfile 参照）。ホスト側のディレクトリもその uid が書ける状態にすること:
#   dev のフォルダは既にあり 0777 + processed/failed が uid 1001 所有。
#   新設するときは: sudo mkdir -p <dir> && sudo chown -R 1001:1001 <dir>
# ずれていると EACCES で黙って止まり、画面では「取込待ちのまま動かない」としか
# 見えない。

set -euo pipefail

GIT_REPO="https://github.com/Kuisin/ckk-tool-v3"
# Dockerfile は自分のディレクトリを build context として書かれている
# （po-extract と同じ。リポジトリ root からの絶対パスにすると二重に連結される）。
BASE_DIR="/coolify/apps/intake-gateway"
DOCKERFILE="/Dockerfile"
WATCH_PATHS="coolify/apps/intake-gateway/**"
API="http://127.0.0.1:8000/api/v1"
TOKEN_FILE=/data/coolify/source/.api-token
WEBHOOK_FILE=/data/coolify/source/.webhook-secrets

TOKEN=$(cat "$TOKEN_FILE")
api() { local m=$1 p=$2; shift 2; curl -sf -X "$m" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json" "$API$p" "$@"; }
api GET /version >/dev/null && echo "API ok"

SERVER_UUID=$(api GET /servers | jq -r '.[0].uuid')
PROJECT_UUID=$(api GET /projects | jq -r '.[] | select(.name == "ckk") | .uuid' | head -1)
[ -n "$PROJECT_UUID" ] || { echo "!! project ckk not found — run setup.sh first"; exit 1; }

create_app() { # name branch env_name host_dir
  local name=$1 branch=$2 env_name=$3 host_dir=$4 uuid secret
  uuid=$(api GET /applications | jq -r ".[] | select(.name == \"$name\") | .uuid" | head -1)
  if [ -z "$uuid" ]; then
    secret=$(openssl rand -hex 20)
    # ports_exposes は必須項目なので形だけ 8000 を宣言する。ports_mappings は
    # 付けない＝ホストに出ない。autogenerate_domain false ＝ 公開 URL も作らない。
    uuid=$(api POST /applications/public -d "{
      \"project_uuid\": \"$PROJECT_UUID\",
      \"server_uuid\": \"$SERVER_UUID\",
      \"environment_name\": \"$env_name\",
      \"name\": \"$name\",
      \"description\": \"CKK 注文請書 メール取込ゲートウェイ ($branch) — internal only\",
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

  # 再実行しても同じ状態に収束させる。
  # watch_paths は**実際の改行**で区切ること（文字列 "\n" を書くと 1 パターン
  # 扱いになり、push しても無言でデプロイされなくなる）。ここは 1 本なので単純。
  api PATCH "/applications/$uuid" -d "{
    \"base_directory\": \"$BASE_DIR\",
    \"dockerfile_location\": \"$DOCKERFILE\",
    \"watch_paths\": \"$WATCH_PATHS\"
  }" >/dev/null && echo "  build settings applied"

  if [ "$(api GET "/applications/$uuid/envs" | jq 'length')" != "0" ]; then
    echo "  envs already present — leaving them alone (manage in the Coolify UI)"
  else
    # メールボックスの資格情報はここには書かない（このファイルは git に入る）。
    # 空で入れておき、値は Coolify の UI で設定する。INTAKE_MAIL_HOST が空の
    # 間はゲートウェイは何もしない（起動して待つだけ）。
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

  # 取込フォルダのバインドマウント。**アプリ間で共有するので名前付きボリュームは
  # 使えない**（Coolify が <appUUID>_<name> に改名するため）。
  # type は persistent|file の 2 択（bind / volume は Validation failed になる）だが、
  # **persistent に host_path を渡すとバインドマウントになる** — 実測で確認済み。
  # nextjs-web-dev の既存マウントも同じ形。
  if api GET "/applications/$uuid/storages" \
       | jq -e '.persistent_storages[]? | select(.mount_path == "/data/intake")' >/dev/null 2>&1; then
    echo "  /data/intake は既にマウント済み"
  elif api POST "/applications/$uuid/storages" -d "{
          \"type\": \"persistent\",
          \"name\": \"${name}-intake\",
          \"host_path\": \"$host_dir\",
          \"mount_path\": \"/data/intake\"
        }" >/dev/null 2>&1; then
    echo "  bind mount attached ($host_dir → /data/intake)"
  else
    echo "  !! /data/intake を付けられなかった — **最初のデプロイ前に** UI で付けること:"
    echo "     $name → Persistent Storage → Add → Bind mount"
    echo "       Host: $host_dir   Container: /data/intake"
    echo "     （nextjs-web 側は dev では設定済み。main はこれから）"
  fi
}

# ── 非公開リポジトリのデプロイキーへ付け替える ─────────────────────────
# **必須。** /applications/public で作ると Coolify 組み込みの擬似ソース
# 「Public GitHub」に紐づき、匿名 HTTPS clone を試みて
#   fatal: could not read Username for 'https://github.com'
# でビルドが落ちる（このリポジトリは非公開）。private_key_id は REST API では
# 設定できない（"This field is not allowed."）ので DB を直接更新する。
# 詳細は coolify/platform/README.md「git アクセスはデプロイキー」。
fix_private_key() {
  docker exec -i coolify-db psql -U coolify -d coolify -q <<'SQL'
update applications
   set git_repository = 'git@github.com:Kuisin/ckk-tool-v3.git',
       private_key_id = 1, source_id = null, source_type = null
 where name in ('intake-gateway-dev','intake-gateway-main')
   and (private_key_id is null or git_repository <> 'git@github.com:Kuisin/ckk-tool-v3.git');
SQL
  echo "private_key_id / git_repository fixed (非公開リポジトリのデプロイキー)"
}

create_app intake-gateway-dev  dev  development /home/kaiseisawada/intake/orders
create_app intake-gateway-main main production  /home/kaiseisawada/intake/orders-main

fix_private_key

cat <<'EOS'

次の手順:
  1. **dev は既に用意済み** — nextjs-web-dev が
       host /home/kaiseisawada/intake/orders → container /data/intake
     をバインドマウントし、INTAKE_DIR=/data/intake を設定している（実測）。
     intake-gateway-dev には**同じホストパス**を同じ位置へ付ける。
     main はフォルダ自体が未整備なので、先に作ること:
       sudo mkdir -p /home/kaiseisawada/intake/orders-main
       sudo chown -R 1001:1001 /home/kaiseisawada/intake/orders-main
     （uid 1001 = nextjs-web / intake-gateway 共通の実行ユーザー）
  2. バインドマウントはこのスクリプトが API で付ける（type=persistent +
     host_path。bind / volume は Validation failed になる）。付かなかったと
     表示されたときだけ UI で手当てする。
  3. Coolify UI で受信箱の資格情報を入れる（INTAKE_MAIL_HOST / USER / PASSWORD）。
     **dev と main で別のメールボックスにすること** — 同じ受信箱を 2 つの
     コンテナが読むと、どちらが先に既読を打つかで取り合いになる。
  4. ./deploy.sh intake-gateway-dev
  5. docker logs -f で確認する:
       「メール取込を開始します」 … 正常
       「メール取込は無効です（…）」 … env が足りない（理由が出る）
       「取込フォルダが使えません」 … uid/gid かマウント（1. と 2. を見直す）
EOS
