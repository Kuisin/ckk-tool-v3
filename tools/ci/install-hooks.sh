#!/usr/bin/env bash
# install-hooks.sh — .githooks/ をこのリポジトリの git フックにする（pnpm hooks:install）。
#
# core.hooksPath は**共有の設定**なので、本体のチェックアウトと全ワークツリーに
# 効く。相対パス（.githooks）にしてあるので、各ワークツリーは自分のチェック
# アウトの .githooks を使う — このフックがまだ無い古いブランチでは何も起きない。
#
# 外すとき: git config --unset core.hooksPath
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
prev="$(git config --get core.hooksPath || true)"
git config core.hooksPath .githooks
echo "core.hooksPath: ${prev:-（未設定）} → .githooks"
echo "有効なフック: $(ls .githooks | tr '\n' ' ')"
