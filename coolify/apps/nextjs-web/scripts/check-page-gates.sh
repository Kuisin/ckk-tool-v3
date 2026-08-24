#!/usr/bin/env bash
# check-page-gates.sh — CI ガード: (dashboard) 配下の全 page.tsx が
# requireAppRead(...)（lib/authz-page.tsx の READ ゲート）を呼んでいることを検査する。
#
# 除外（ゲート対象外のページ）:
# - home / profile/** / docs/** / notifications/** — アプリ権限を持たない
#   （セッションのみ）ページ
# - [...rest]（catch-all → notFound）/ preview（開発用カタログ）
# - admin/** ・ settings/page.tsx ・ settings/notifications — 旧パスの
#   リダイレクトのみで app-list エントリを持たない
# ※ production/sales-orders はランチャー非掲載だが requireAppRead("work-orders")
#   でゲート済み（除外しない）。
set -euo pipefail
cd "$(dirname "$0")/.."

EXCLUDE_REGEX='^src/app/\(dashboard\)/(page\.tsx$|profile/|docs/|notifications/|\[\.\.\.rest\]/|preview/|admin/|settings/page\.tsx$|settings/notifications/)'

fail=0
while IFS= read -r -d '' f; do
  if [[ $f =~ $EXCLUDE_REGEX ]]; then
    continue
  fi
  if ! grep -q 'requireAppRead(' "$f"; then
    echo "MISSING requireAppRead: $f"
    fail=1
  fi
done < <(find 'src/app/(dashboard)' -name page.tsx -print0 | sort -z)

if [[ $fail -ne 0 ]]; then
  echo "check-page-gates: 上記ページに requireAppRead ゲートがありません (src/lib/authz-page.tsx 参照)" >&2
  exit 1
fi
echo "check-page-gates: OK"
