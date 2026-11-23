#!/usr/bin/env bash
# shell-vars-check.sh — シェルスクリプトで「$変数」の直後に全角文字を書いていないか。
#
# macOS 標準の bash 3.2 は UTF-8 のロケールで `"$mode）"` の `）` の先頭バイトを
# 変数名の続きとして読み、`mode�: unbound variable` で落ちる（set -u の下）。
# Linux の bash では起きないので CI では見えず、手元（Mac）で回したときにだけ
# 壊れる — 2026-11-23 に tools/ci/local-check.sh が 2 回これで落ちた。
# 直し方は `${mode}）` と波括弧で囲むこと。
#
#   bash tools/ci/shell-vars-check.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
# コメント行（先頭が #）は bash が展開しないので数えない。
hits=$(git ls-files '*.sh' .githooks | xargs grep -nE '\$[A-Za-z_][A-Za-z0-9_]*[^ -~[:space:]]' 2>/dev/null \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*#')
if [ -n "$hits" ]; then
  echo "\$変数 の直後に全角文字がある — \${変数} と波括弧で囲むこと（macOS の bash 3.2 で落ちる）:"
  echo "$hits"
  exit 1
fi
echo "ok"
