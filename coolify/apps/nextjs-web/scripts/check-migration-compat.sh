#!/usr/bin/env bash
# check-migration-compat.sh — マイグレーションが「前のアプリでも動く」形かを見る。
#
# デプロイとマイグレーションはどちらが先に着くか決められない（別々の Coolify
# アプリで、同じ merge から並行に走る）。順序を無関係にするには両方向の安全が要る:
#
#   アプリが先・スキーマが後 … /api/health が待つ（lib/schema-readiness.ts）
#   スキーマが先・アプリが後 … **マイグレーションが後方互換であること**  ← ここ
#
# 列を「足す」のは安全（古い Client は SELECT しない）。危ないのは
# 落とす・改名する・NOT NULL を後付けする類で、これらは**まだ動いている前の
# バージョン**を壊す。壊す変更を禁止はしないが、意図的だと言わせる。
#
# 逃がし方: その migration.sql の中に理由付きで 1 行入れる。
#   -- allow-destructive: 旧アプリはこの列を読まない（v1.2 で参照をやめた）
#
# 使い方: bash scripts/check-migration-compat.sh [base-ref]
set -uo pipefail

BASE="${1:-origin/dev}"
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
MIG_DIR="shared-db/prisma/migrations"

cd "$ROOT" || exit 1

# base が引けないまま進むと diff が空になり、**ガードが黙って通る**。
# 守っているつもりで守れていない状態がいちばん悪いので、ここで落とす。
# （CI は fetch-depth: 0 でチェックアウトすること）
if ! git rev-parse --verify --quiet "$BASE" >/dev/null; then
  echo "check-migration-compat: base ref '$BASE' を解決できません。" >&2
  echo "  浅いクローンだと差分が取れず、ガードが素通りします" >&2
  echo "  （CI は actions/checkout に fetch-depth: 0 を指定）。" >&2
  exit 1
fi

# base から見て**追加・変更された** migration.sql だけを見る。
# 既に適用済みの過去分を蒸し返さないため。
# （mapfile は bash 4+ 専用で macOS の bash 3.2 に無いので使わない）
FILES=$(git diff --name-only --diff-filter=AM "$BASE"...HEAD -- "$MIG_DIR" \
          | grep 'migration\.sql$' || true)

if [ -z "$FILES" ]; then
  echo "check-migration-compat: 対象のマイグレーション変更なし"
  exit 0
fi
COUNT=$(printf '%s\n' "$FILES" | wc -l | tr -d ' ')

# 前のアプリを壊しうる DDL。ALTER TYPE ... ADD VALUE のような「増やす」系は入れない。
PATTERN='DROP[[:space:]]+COLUMN|DROP[[:space:]]+TABLE|DROP[[:space:]]+(TYPE|SCHEMA)|RENAME[[:space:]]+(COLUMN|TO)|SET[[:space:]]+NOT[[:space:]]+NULL|DROP[[:space:]]+DEFAULT|DROP[[:space:]]+CONSTRAINT'

FAILED=0
while IFS= read -r f; do
  [ -n "$f" ] && [ -f "$f" ] || continue
  # 意図的だと書いてあれば通す。
  if grep -qiE '^--[[:space:]]*allow-destructive:' "$f"; then
    reason=$(grep -iE '^--[[:space:]]*allow-destructive:' "$f" | head -1)
    echo "check-migration-compat: SKIP $f"
    echo "    $reason"
    continue
  fi
  hits=$(grep -inE "$PATTERN" "$f" | grep -vE '^[0-9]+:[[:space:]]*--' || true)
  if [ -n "$hits" ]; then
    echo "check-migration-compat: NG $f"
    echo "$hits" | sed 's/^/    /'
    FAILED=1
  fi
done <<EOF
$FILES
EOF

if [ "$FAILED" -eq 1 ]; then
  cat <<'MSG'

前のバージョンのアプリを壊しうる DDL があります。デプロイとマイグレーションは
並行に走るので、**スキーマが先に着いたとき旧アプリがまだ動いています**。

  ・列や表を消す/改名するときは、参照をやめたリリースを先に出してから、
    次のリリースで消す（expand / contract）。
  ・NOT NULL の後付けは、既定値付きで足す → 埋める → 制約を付ける、
    と分けて出す。

意図的にやるなら、その migration.sql の先頭に理由を書いてください:

  -- allow-destructive: 旧アプリはこの列を読まない（v1.2 で参照をやめた）
MSG
  exit 1
fi

echo "check-migration-compat: OK ($COUNT 件)"
