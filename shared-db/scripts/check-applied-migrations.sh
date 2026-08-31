#!/usr/bin/env bash
# check-applied-migrations.sh — **マージ済みのマイグレーションを書き換えていないか**。
#
# ■ なぜ必要か
# このリポジトリではマイグレーションが **merge した瞬間に自動で当たる**
# （db-migrate-dev / db-migrate-main が `prisma migrate deploy` を流す）。
# つまり base ブランチに載っているマイグレーションは、もう本物の DB に
# 適用済みで、**取り消せない**。
#
# Prisma は適用済みマイグレーションの checksum を `_prisma_migrations` に
# 持っている。あとから中身を直すと、次のデプロイが
#   P3006 / "migration ... has been modified after it was applied"
# で落ちる。しかも落ちるのは**次に誰かが何かを merge したとき**なので、
# 直した本人ではなく無関係な人の変更が止まる。
#
# 実際にこれをやりかけた（2026-08-31）: ディスプレイ機能の PR を merge した
# あとに、同じ PR ブランチで元のマイグレーションを書き換えて続きを作った。
# 気づいたのは偶然で、そのまま merge していれば dev のデプロイが止まっていた。
#
# ■ 判定
# base（既定 origin/dev）に存在する `shared-db/prisma/migrations/**` の
# ファイルが、変更・削除・改名されていたら **失敗**。
# 新しいディレクトリを足すのは当然 OK。
#
# ■ 直し方
#   1. 元のファイルを base の内容に戻す:
#        git checkout origin/dev -- shared-db/prisma/migrations/<名前>/migration.sql
#   2. 差分は**新しいマイグレーション**として足す（ALTER で当てる）
#   3. 使い捨て DB で通す:
#        docker run -d --name t -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ckk \
#          -p 55444:5432 groonga/pgroonga:4.0.6-alpine-17
#        DATABASE_URL=postgresql://postgres:postgres@localhost:55444/ckk \
#          pnpm exec prisma migrate deploy
#
# 使い方: bash shared-db/scripts/check-applied-migrations.sh [base-ref]

set -euo pipefail

BASE_REF="${1:-${MIGRATION_BASE_REF:-origin/dev}}"
MIGRATIONS_DIR="shared-db/prisma/migrations"

cd "$(git rev-parse --show-toplevel)"

if ! git rev-parse --verify --quiet "$BASE_REF" >/dev/null; then
  echo "check-applied-migrations: base ref '$BASE_REF' が見つかりません（git fetch 済みか確認）" >&2
  exit 1
fi

# base に無いディレクトリ（= この PR で新しく足したもの）は対象外。
# それ以外のファイルが 1 つでも動いていたら止める。
violations=$(
  git diff --name-status "$BASE_REF"...HEAD -- "$MIGRATIONS_DIR" \
    | awk '$1 != "A" { print }'
)

if [ -z "$violations" ]; then
  echo "check-applied-migrations: OK（$BASE_REF のマイグレーションは触られていません）"
  exit 0
fi

echo "check-applied-migrations: ✗ 適用済みのマイグレーションが変更されています" >&2
echo >&2
echo "$violations" | while read -r status path; do
  case "$status" in
    M*) label="変更" ;;
    D*) label="削除" ;;
    R*) label="改名" ;;
    *)  label="$status" ;;
  esac
  echo "  [$label] $path" >&2
done
echo >&2
echo "マイグレーションは merge した瞬間に本物の DB へ当たります（自動適用）。" >&2
echo "適用済みのファイルを書き換えると、次のデプロイが P3006 で落ちます —" >&2
echo "しかも落ちるのは、無関係な誰かが次に merge したときです。" >&2
echo >&2
echo "直し方:" >&2
echo "  1) git checkout $BASE_REF -- $MIGRATIONS_DIR" >&2
echo "  2) 差分は **新しいマイグレーション** として足す（ALTER で当てる）" >&2
echo "  3) 使い捨て DB に prisma migrate deploy を通して確認する" >&2
exit 1
