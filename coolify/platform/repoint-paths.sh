#!/usr/bin/env bash
# repoint-paths.sh — リポジトリ再編（docker-compose/ → coolify/apps/）に伴い、
# Coolify アプリのビルドパス設定を新レイアウトへ揃える **一度きり** のスクリプト。
#
# Run ON docker-mac-pro:  bash ~/stacks/coolify/repoint-paths.sh dev|main
#
# なぜ手作業のスクリプトが要るか: base_directory / dockerfile_location /
# watch_paths はリポジトリではなく **Coolify の DB** にある。だからパスを動かす
# コミットをマージしただけでは追従せず、次のデプロイが「Dockerfile が無い」で
# 失敗する。
#
# **環境ごとに分けて流すこと。** dev アプリは dev ブランチが新レイアウトに
# なった直後に、main アプリは promotion（dev→main）が済んだ後に流す。先に
# main を書き換えると、まだ旧レイアウトの main ブランチをビルドしに行って
# 失敗する。
#
# 冪等 — 同じ値を二度 PATCH しても害はない。両環境の promotion が終わったら
# このファイルは消してよい。
set -euo pipefail

ENV_SUFFIX="${1:-}"
case "$ENV_SUFFIX" in
  dev|main) ;;
  *) echo "usage: repoint-paths.sh dev|main" >&2; exit 1 ;;
esac

API="http://127.0.0.1:8000/api/v1"
TOKEN=$(cat /data/coolify/source/.api-token)

# ckk-db だけ dev/main の命名が -dev / -main で揃っているので個別に組み立てる。
if [ "$ENV_SUFFIX" = "dev" ]; then
  DB_APP="ckk-db-dev"
else
  DB_APP="ckk-db-main"
fi

WORKSPACE_WATCH='packages/**\npnpm-lock.yaml\npnpm-workspace.yaml\npackage.json'

# name|base_directory|dockerfile_location|watch_paths
# dockerfile_location が空の行は送らない（admintools は nixpacks ビルドで null）。
APPS="
nextjs-web-${ENV_SUFFIX}|/|/coolify/apps/nextjs-web/Dockerfile|coolify/apps/nextjs-web/**\n${WORKSPACE_WATCH}
nextjs-kiosk-${ENV_SUFFIX}|/|/coolify/apps/nextjs-kiosk/Dockerfile|coolify/apps/nextjs-kiosk/**\n${WORKSPACE_WATCH}
admintools-${ENV_SUFFIX}|/coolify/apps/admintools||coolify/apps/admintools/**
po-extract-${ENV_SUFFIX}|/coolify/apps/po-extract|/Dockerfile|coolify/apps/po-extract/**
${DB_APP}|/coolify/apps/ckk-db|/Dockerfile|coolify/apps/ckk-db/**
db-migrate-${ENV_SUFFIX}|/|/coolify/apps/db-migrate/Dockerfile|shared-db/**
"

apps_json=$(curl -sf -H "Authorization: Bearer $TOKEN" "$API/applications")

echo "$APPS" | while IFS='|' read -r name base dockerfile watch; do
  [ -n "$name" ] || continue

  uuid=$(printf '%s' "$apps_json" | jq -r --arg n "$name" '.[] | select(.name == $n) | .uuid')
  if [ -z "$uuid" ] || [ "$uuid" = "null" ]; then
    echo "!! $name が見つからない — 飛ばす" >&2
    continue
  fi

  patch=$(jq -nc --arg base "$base" --arg watch "$watch" --arg df "$dockerfile" '
    {base_directory: $base, watch_paths: $watch}
    + (if ($df | length) > 0 then {dockerfile_location: $df} else {} end)')

  curl -sf -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "$patch" "$API/applications/$uuid" >/dev/null
  echo "✓ $name → base=$base ${dockerfile:+dockerfile=$dockerfile}"
done

echo
echo "反映後の確認:"
curl -sf -H "Authorization: Bearer $TOKEN" "$API/applications" \
  | jq -r '.[] | "\(.name)\t\(.base_directory)\t\(.dockerfile_location // "-")"' | sort
