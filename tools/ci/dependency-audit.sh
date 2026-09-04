#!/usr/bin/env bash
# dependency-audit.sh — CI ガード: 本番依存に high 以上の advisory が無いことを
# `pnpm audit --prod --audit-level=high` で検査する（監査 C1）。
#
# 素の `pnpm audit` をそのまま step にしていたときの問題:
#   pnpm audit は npm レジストリの監査エンドポイント
#   (https://registry.npmjs.org/-/npm/v1/security/audits) に依存ツリーを
#   送って判定を受け取る。このエンドポイントが落ちると ERR_SOCKET_TIMEOUT で
#   コマンド自体が失敗し、**脆弱性が 1 件も無くても** CI が赤になる。
#   2026-09-04 に実際に起きた — レジストリ本体（packument）は応答するのに
#   監査エンドポイントだけが数十分タイムアウトし、その間に開いた PR と
#   dev → main 昇格 PR の全部がこの 1 step で落ちた。
#
# ここでは失敗を 2 種類に分ける:
#   1. 脆弱性が見つかった        → exit 1 のまま（従来どおり止める）
#   2. エンドポイントに届かない  → ::warning:: を出して exit 0
#      （判定できなかったことを隠さず、しかし止めもしない。監査は全 PR で
#        毎回走るので、レジストリが戻れば次の PR で必ず検査される）
#
# 2 の判定は「pnpm の出力にネットワーク/レスポンス系のエラーコードがあり、
# かつ脆弱性の表が出ていない」こと。両方満たさなければ元の exit code で落とす
# （見分けがつかないものは安全側 = 失敗のまま）。
#
# 使い方（リポジトリルート・CI と同じ）: bash tools/ci/dependency-audit.sh
set -uo pipefail
cd "$(dirname "$0")/../.."

out=$(mktemp)
trap 'rm -f "$out"' EXIT

pnpm audit --prod --audit-level=high 2>&1 | tee "$out"
rc=${PIPESTATUS[0]}

if [ "$rc" -eq 0 ]; then
  exit 0
fi

# pnpm が投げるレジストリ到達不能・不正応答のコード群。
#   ERR_SOCKET_TIMEOUT / FetchError … 接続・読み取りタイムアウト
#   ERR_PNPM_AUDIT_BAD_RESPONSE     … 5xx など、監査エンドポイントの異常応答
#   ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS … 404（エンドポイントが無い）
#   ECONNRESET / ENOTFOUND / EAI_AGAIN / ETIMEDOUT / ECONNREFUSED … OS レベル
unreachable_re='ERR_SOCKET_TIMEOUT|FetchError|ERR_PNPM_AUDIT_BAD_RESPONSE|ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED'

if grep -qE "$unreachable_re" "$out" && ! grep -qiE 'vulnerabilit(y|ies) found' "$out"; then
  msg="npm の監査エンドポイントに届かず、依存の脆弱性を判定できませんでした（レジストリ側の障害）。脆弱性が見つかったのではありません。次の PR で再検査されます。"
  echo "::warning title=Dependency audit skipped (registry unreachable)::${msg}"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo "### ⚠️ Dependency audit skipped"
      echo
      echo "$msg"
    } >> "$GITHUB_STEP_SUMMARY"
  fi
  exit 0
fi

exit "$rc"
