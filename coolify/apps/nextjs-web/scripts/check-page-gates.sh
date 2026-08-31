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
#
# 第 2 パスで (portal)（取引先ポータル）も見る。あちらは Auth.js の外なので
# ゲートの貼り忘れが即「未認証で見える」になる — 詳細は下のコメント。
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

# ─── 第 2 パス: 取引先ポータル（社外向け・(portal) 配下）────────────────────
#
# ポータルは Auth.js のセッションを持たない別の認証系で、proxy.ts の matcher が
# /portal を**認証対象から外している**。つまりここのゲートを 1 枚貼り忘れると、
# 未認証のインターネット利用者にそのページがそのまま出る。
#
# page.tsx        … requirePortalView( か requirePortalFeature(
#                   （ログイン画面のようにセッションが無くて当然の面は後者）
# route.ts        … isDevFeatureEnabled( （**ルートハンドラはレイアウトを
#                   通らない**ので、レイアウト側のフラグ確認が効かない）
if [[ -d 'src/app/(portal)' ]]; then
  while IFS= read -r -d '' f; do
    if ! grep -qE 'requirePortalView\(|requirePortalFeature\(' "$f"; then
      echo "MISSING requirePortalView/requirePortalFeature: $f"
      fail=1
    fi
  done < <(find 'src/app/(portal)' -name page.tsx -print0 | sort -z)

  while IFS= read -r -d '' f; do
    if ! grep -q 'isDevFeatureEnabled(' "$f"; then
      echo "MISSING isDevFeatureEnabled: $f"
      fail=1
    fi
  done < <(find 'src/app/(portal)' -name route.ts -print0 | sort -z)

  if [[ $fail -ne 0 ]]; then
    echo "check-page-gates: (portal) のゲートがありません (src/lib/portal-page.tsx 参照)" >&2
    exit 1
  fi
fi

echo "check-page-gates: OK"
