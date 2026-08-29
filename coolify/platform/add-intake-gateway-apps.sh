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
# ホストのバインドマウント（例 /data/intake-dev → /intake）にすること。
# API の /storages は persistent|file しか受けないため、バインドは UI で付ける。
# 下の案内を読んで、**最初のデプロイ前に**両アプリへ同じホストパスを付ける。
#
# ⚠️ uid/gid — このコンテナは nextjs-web と同じ **1001:1001** で走る
# （Dockerfile 参照）。ホスト側のディレクトリもその uid が書ける状態にすること:
#   sudo mkdir -p /data/intake-dev && sudo chown -R 1001:1001 /data/intake-dev
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
      {\"key\": \"INTAKE_DIR\",                \"value\": \"/intake\"},
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

  # バインドマウントは API から作れない（type は persistent|file の 2 択で、
  # ホストパスを指定できない）。UI での手順を出して終わる。
  if api GET "/applications/$uuid/storages" \
       | jq -e '.persistent_storages[]? | select(.mount_path == "/intake")' >/dev/null 2>&1; then
    echo "  /intake は既にマウント済み"
  else
    echo "  !! /intake が未マウント — **最初のデプロイ前に** UI で付けること:"
    echo "     $name → Persistent Storage → Add → Bind mount"
    echo "       Host: $host_dir   Container: /intake"
    echo "     nextjs-web-${name#intake-gateway-} 側にも同じホストパスを付けること"
  fi
}

create_app intake-gateway-dev  dev  development /data/intake-dev
create_app intake-gateway-main main production  /data/intake-main

cat <<'EOS'

次の手順:
  1. ホスト側のフォルダを作り、nextjs-web と同じ uid(1001) が書けるようにする:
       sudo mkdir -p /data/intake-dev /data/intake-main
       sudo chown -R 1001:1001 /data/intake-dev /data/intake-main
  2. Coolify UI で **両方のアプリ**にバインドマウントを付ける（上の案内のとおり）:
       intake-gateway-dev  : /data/intake-dev  → /intake
       nextjs-web-dev      : /data/intake-dev  → /intake
     nextjs-web 側は env INTAKE_DIR=/intake も設定する（今は dev のみ設定済み）。
  3. Coolify UI で受信箱の資格情報を入れる（INTAKE_MAIL_HOST / USER / PASSWORD）。
     **dev と main で別のメールボックスにすること** — 同じ受信箱を 2 つの
     コンテナが読むと、どちらが先に既読を打つかで取り合いになる。
  4. ./deploy.sh intake-gateway-dev
  5. docker logs -f で「メール取込を開始します」を確認。
     「メール取込は無効です」なら env が足りていない（理由が出る）。
     「取込フォルダが使えません」なら uid/gid かマウント（1. と 2. を見直す）。

注意: main は取込フォルダのマウントがまだ無い。先に 1./2. を main 側にも
      行い、nextjs-web-main の INTAKE_DIR を設定してから deploy すること。
EOS
