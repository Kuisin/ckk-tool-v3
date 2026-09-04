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
# ■ 例外（1 つだけ）
# 上の理屈は「base のマイグレーションは適用済み」が前提。**適用に失敗して
# 止まっている** 1 本はその外側で、後ろに足しても直せない（Prisma は失敗した
# 1 本があるとその先を流さない = P3018。まっさらな DB でも同じ場所で止まる）。
# その場合に限り、migration.sql の先頭に
#   -- allow-rewrite: <なぜ安全か。どの DB にも当たっていない根拠>
# と書けば変更を通す。削除・改名は引き続き禁止。詳細は下の実装コメント。
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
changed=$(
  git diff --name-status "$BASE_REF"...HEAD -- "$MIGRATIONS_DIR" \
    | awk '$1 != "A" { print }'
)

# ── 例外: 一度も適用できていないマイグレーション ────────────────────────────
# 上の理屈は「base のマイグレーションは適用済み」を前提にしている。**適用に
# 失敗して止まっている** 1 本はその前提の外にある:
#   - Prisma は失敗した 1 本があるとその先を一切流さない（P3018）ので、
#     後ろに新しいマイグレーションを足しても永遠に届かない
#   - まっさらな DB でも同じ場所で必ず止まる（新規構築・復旧ができない）
# つまり直す道はそのファイルを直すことだけなので、**変更（M）に限り**
# migration.sql の先頭に
#   -- allow-rewrite: <なぜ安全か。どの DB にも当たっていない根拠>
# と書いて意図的だと言わせる（allow-destructive と同じ流儀）。削除・改名は
# 引き続き禁止 — 履歴からファイルが消えると checksum の照合先が無くなる。
#
# ⚠️ **本当に適用済みのファイルにこの印を付けてはいけない。** その場合は
# 次のデプロイが P3006 で落ち、しかも落ちるのは無関係な誰かの merge のとき。
# 印を付ける前に `prisma migrate status` で failed と出ることを確かめること。
violations=""
while read -r status path; do
  [ -n "$status" ] || continue
  case "$status" in
    M*)
      if [ -f "$path" ] && grep -q -- '-- allow-rewrite:' "$path"; then
        echo "check-applied-migrations: 許可（allow-rewrite）: $path"
        continue
      fi
      ;;
  esac
  violations="${violations}${status}	${path}
"
done <<EOF
$changed
EOF
violations=$(printf '%s' "$violations")

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
