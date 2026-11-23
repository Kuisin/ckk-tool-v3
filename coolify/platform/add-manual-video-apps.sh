#!/usr/bin/env bash
# Register the manual-videos (マニュアルの動画の録画) apps in Coolify (idempotent).
# Run ON docker-mac-pro:  bash ~/stacks/coolify/add-manual-video-apps.sh
#
# Creates:
#   manual-videos-dev   branch dev   環境 development  → ~/manual-videos/dev
#   manual-videos-main  branch main  環境 production   → ~/manual-videos/main
# and wires the SAME host directory into nextjs-web-dev / nextjs-web-main
# (read side: mount + env MANUAL_VIDEO_DIR).
#
# ■ 何をするアプリか
#   起動時に、コンテナの中の使い捨て Postgres へデモシードを入れ、ビルド済みの
#   nextjs-web を立て、業務の通し操作（tools/docs-screenshots/walkthroughs/）を
#   Playwright で録画して、ホストのディレクトリへ webm・字幕・manifest.json を
#   書き出す。動画は git にもアプリのイメージにも入らない。
#   **業務 DB（ckk-db-*）にはつながない** — 接続先を 1 つも渡していない。
#
# ■ アプリのデプロイとは別に動く
#   watch_paths は通し操作のスクリプトとこのアプリ自身だけ。ふだんの nextjs-web の
#   push では動かない（Next のビルドがもう 1 本走ることも、録画が走ることも無い）。
#   画面の見た目が変わって撮り直したいときは手で流す:
#       coolify/platform/deploy.sh manual-videos-dev
#
# ■ 内部専用
#   ホストポートも公開ドメインもネットワーク別名も無い。誰からも呼ばれない。
#
# ■ Coolify のヘルスチェックは切る（health_check_enabled=false）
#   HTTP を持たない。代わりにイメージ側の HEALTHCHECK（/tmp/videos-ok の有無 =
#   録画が最後まで通ったか）を使う。通らなければコンテナが非 0 で終了し、
#   デプロイが失敗として残る。出力先は前回のまま（壊れた動画で上書きしない）。
#
# ■ 置き場はホストの bind mount
#   名前付きボリュームは Coolify が <appUUID>_<name> に改名するので、録画する側と
#   配る側（nextjs-web）で共有できない。bind mount はそのまま通る。
#   ホーム配下に置くのは注文書の取込フォルダ（~/intake/orders）と同じ流儀
#   （sudo なしで作れる）。nextjs-web は uid 1001 で**読むだけ**なので、録画側が
#   書いたあと a+rX を付けている（entrypoint.sh）。

set -euo pipefail

GIT_REPO="https://github.com/Kuisin/ckk-tool-v3"
BASE_DIR="/"
DOCKERFILE="/coolify/apps/manual-videos/Dockerfile"
API="http://127.0.0.1:8000/api/v1"
TOKEN_FILE=/data/coolify/source/.api-token
WEBHOOK_FILE=/data/coolify/source/.webhook-secrets
HOST_ROOT="/home/kaiseisawada/manual-videos"
# 配る側（nextjs-web）のコンテナ内パス = env MANUAL_VIDEO_DIR
READ_MOUNT="/data/manual-videos"

# ★ 区切りは**本物の改行**。文字としての \n を書くと Coolify は値全体を 1 つの
#   パターンとして扱い、何にも一致しなくなる（push しても一生デプロイされない）。
#   下で jq が JSON にするので、ここは素の改行で書く。
WATCH_PATHS=$'tools/docs-screenshots/walkthroughs/**\ntools/docs-screenshots/walkthroughs.spec.ts\ntools/docs-screenshots/playwright.walkthroughs.config.ts\ntools/docs-screenshots/scripts/walkthroughs.ts\ncoolify/apps/manual-videos/**'

TOKEN=$(cat "$TOKEN_FILE")
api() { local m=$1 p=$2; shift 2; curl -sf -X "$m" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json" "$API$p" "$@"; }
api GET /version >/dev/null && echo "API ok"

SERVER_UUID=$(api GET /servers | jq -r '.[0].uuid')
PROJECT_UUID=$(api GET /projects | jq -r '.[] | select(.name == "ckk") | .uuid' | head -1)
[ -n "$PROJECT_UUID" ] || { echo "!! project ckk not found — run setup.sh first"; exit 1; }

app_uuid() { api GET /applications | jq -r ".[] | select(.name == \"$1\") | .uuid" | head -1; }

# bind mount を付ける（既にあれば何もしない）。type は persistent|file の 2 択だが、
# persistent に host_path を渡すとバインドマウントになる（add-intake-gateway-app.sh）。
add_bind() { # uuid app_name host_path mount_path
  local uuid=$1 name=$2 host=$3 mount=$4
  if api GET "/applications/$uuid/storages" \
       | jq -e --arg m "$mount" '.persistent_storages[]? | select(.mount_path == $m)' >/dev/null 2>&1; then
    echo "  $mount は既にマウント済み"
  elif api POST "/applications/$uuid/storages" -d "$(jq -n \
        --arg n "${name}-manual-videos" --arg h "$host" --arg m "$mount" \
        '{type: "persistent", name: $n, host_path: $h, mount_path: $m}')" >/dev/null 2>&1; then
    echo "  bind mount attached ($host → $mount)"
  else
    echo "  !! $mount を付けられなかった — **デプロイ前に** UI で付けること:"
    echo "     $name → Persistent Storage → Add → Bind mount"
    echo "       Host: $host   Container: $mount"
  fi
}

create_recorder() { # name branch env_name host_dir
  local name=$1 branch=$2 env_name=$3 host_dir=$4 uuid secret
  mkdir -p "$host_dir"
  uuid=$(app_uuid "$name")
  if [ -z "$uuid" ]; then
    secret=$(openssl rand -hex 20)
    # ports_exposes は必須項目なので形だけ宣言する。ports_mappings は付けない
    # ＝ホストに出ない。autogenerate_domain false ＝ 公開 URL も作らない。
    uuid=$(api POST /applications/public -d "$(jq -n \
      --arg p "$PROJECT_UUID" --arg s "$SERVER_UUID" --arg e "$env_name" --arg n "$name" \
      --arg r "$GIT_REPO" --arg b "$branch" --arg bd "$BASE_DIR" --arg df "$DOCKERFILE" --arg sec "$secret" \
      '{project_uuid: $p, server_uuid: $s, environment_name: $e, name: $n,
        description: "CKK マニュアルの動画の録画 — internal only",
        git_repository: $r, git_branch: $b, build_pack: "dockerfile",
        base_directory: $bd, dockerfile_location: $df, ports_exposes: "8000",
        autogenerate_domain: false, health_check_enabled: false,
        is_auto_deploy_enabled: true, manual_webhook_secret_github: $sec,
        instant_deploy: false}')" | jq -r '.uuid')
    echo "$name github_webhook_secret=$secret" >> "$WEBHOOK_FILE"; chmod 600 "$WEBHOOK_FILE"
    echo "created $name: $uuid"
  else
    echo "exists  $name: $uuid"
  fi

  api PATCH "/applications/$uuid" -d "$(jq -n \
    --arg bd "$BASE_DIR" --arg df "$DOCKERFILE" --arg w "$WATCH_PATHS" \
    '{base_directory: $bd, dockerfile_location: $df, watch_paths: $w,
      is_auto_deploy_enabled: true, health_check_enabled: false}')" >/dev/null \
    && echo "  build settings applied"
  local n
  n=$(api GET "/applications/$uuid" | jq '.watch_paths | split("\n") | length')
  [ "$n" = "5" ] || echo "  !! watch_paths が $n 本（5 本のはず）— 改行が壊れていないか UI で確認すること"

  add_bind "$uuid" "$name" "$host_dir" "/out"
}

# 配る側: nextjs-web に同じホストパスを読み取り用に見せ、置き場を env で教える。
wire_reader() { # web_app_name host_dir
  local name=$1 host_dir=$2 uuid
  uuid=$(app_uuid "$name")
  if [ -z "$uuid" ]; then
    echo "!! $name が見つからない — setup.sh を先に流すこと"
    return 0
  fi
  echo "reader  $name: $uuid"
  add_bind "$uuid" "$name" "$host_dir" "$READ_MOUNT"
  if api GET "/applications/$uuid/envs" | jq -e '.[] | select(.key == "MANUAL_VIDEO_DIR")' >/dev/null 2>&1; then
    echo "  MANUAL_VIDEO_DIR は設定済み"
  elif api POST "/applications/$uuid/envs" -d "$(jq -n --arg v "$READ_MOUNT" \
        '{key: "MANUAL_VIDEO_DIR", value: $v}')" >/dev/null 2>&1; then
    echo "  MANUAL_VIDEO_DIR=$READ_MOUNT を設定"
  else
    echo "  !! MANUAL_VIDEO_DIR を設定できなかった — UI で $name の env に足すこと: MANUAL_VIDEO_DIR=$READ_MOUNT"
  fi
}

create_recorder manual-videos-dev  dev  development "$HOST_ROOT/dev"
create_recorder manual-videos-main main production  "$HOST_ROOT/main"
wire_reader nextjs-web-dev  "$HOST_ROOT/dev"
wire_reader nextjs-web-main "$HOST_ROOT/main"

# ── 非公開リポジトリのデプロイキーへ付け替える ─────────────────────────
# **必須。** /applications/public で作ると匿名 HTTPS clone を試みてビルドが落ちる。
# private_key_id は REST API では設定できないため DB を直接更新する
# （coolify/platform/README.md「git アクセスはデプロイキー」）。
docker exec -i coolify-db psql -U coolify -d coolify -q <<SQL
update applications
   set git_repository = 'git@github.com:Kuisin/ckk-tool-v3.git',
       private_key_id = 1, source_id = null, source_type = null
 where name in ('manual-videos-dev', 'manual-videos-main')
   and (private_key_id is null or git_repository <> 'git@github.com:Kuisin/ckk-tool-v3.git');
SQL
echo "private_key_id / git_repository fixed (非公開リポジトリのデプロイキー)"

cat <<EOS

次の手順:
  1. 最初の録画を流す（ビルド込みで 20〜30 分。2 回目以降は層のキャッシュが効く）:
       ./deploy.sh manual-videos-dev
     成功すると $HOST_ROOT/dev に manifest.json と <id>.webm / .vtt / .jpg ができる。
  2. nextjs-web-dev を再デプロイする（マウントと MANUAL_VIDEO_DIR は次のデプロイから効く）:
       ./deploy.sh dev
     https://app-dev.ckk-tool.co.jp/manual/ja/process/sales に動画が出れば完了。
  3. 本番は dev → main の昇格のあと、同じ 2 手順を main で:
       ./deploy.sh manual-videos-main && ./deploy.sh main
  4. push での自動起動は webhook が要る（README「GitHub webhook」）。張っていない間は
     通し操作を直したあと ./deploy.sh manual-videos-dev を手で流す。
  5. 失敗したら Coolify のデプロイログを読む — どの動画のどの手順で、何を待って
     落ちたかがそのまま出る。出力先は前回の動画のまま残る。
EOS
