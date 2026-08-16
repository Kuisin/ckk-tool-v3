#!/usr/bin/env bash
# check-use-server-exports.sh — CI ガード: `"use server"` のモジュールが
# **async 関数以外を export していない**ことを検査する。
#
# なぜ必要か:
#   `"use server"` ファイルの export はすべて Server Action として扱われる。
#   定数や通常の関数を export すると、クライアントが受け取るのは値ではなく
#   アクションの参照になり、配列なら `.map()` した瞬間に TypeError で画面ごと
#   落ちる。tsc も biome も next build もこれを検出しなかった（実際に
#   `DOCUMENT_LINK_TYPES` を actions から export してメモ編集が全滅した）。
#
# 許可する export:
#   export async function foo(...)          … Server Action 本体
#   export type / export interface          … 型は消えるので安全
#   export { type A } from "..."            … 型のみの再 export
#
# 値を共有したいときは `"use server"` ではない普通のモジュールへ切り出すこと
#   （例: src/components/ui/document-link-types.ts）。
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
while IFS= read -r -d '' f; do
  # 先頭の数行に "use server" ディレクティブがあるファイルだけを対象にする。
  if ! head -3 "$f" | grep -qE '^[[:space:]]*("use server"|'\''use server'\'');?[[:space:]]*$'; then
    continue
  fi

  bad=$(grep -nE '^export ' "$f" \
    | grep -vE '^[0-9]+:export async function ' \
    | grep -vE '^[0-9]+:export (type|interface) ' \
    | grep -vE '^[0-9]+:export \{[^}]*\} from ' || true)

  if [ -n "$bad" ]; then
    echo "INVALID export in \"use server\" file: $f"
    echo "$bad" | sed 's/^/    /'
    fail=1
  fi
done < <(find src \( -name '*.ts' -o -name '*.tsx' \) -print0)

if [ "$fail" -ne 0 ]; then
  echo
  echo 'FAIL: "use server" ファイルは async 関数のみ export できます。'
  echo '      値・定数は別モジュール（"use server" なし）へ切り出してください。'
  exit 1
fi

echo 'OK: "use server" exports are all async functions.'
