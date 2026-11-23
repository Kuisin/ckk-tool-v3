#!/usr/bin/env bash
# changed-areas.test.sh — changed-areas.sh の規則の試験。CI の `changes` ジョブが
# 判定の前に流す（規則が壊れたまま「全部飛ばす」CI にならないように）。
#   bash tools/ci/changed-areas.test.sh
set -uo pipefail
cd "$(dirname "$0")/../.."

fail=0
# expect "<説明>" "<base>" "<期待する出力の一部 (key=value をスペース区切り)>" files...
expect() {
  local desc="$1" base="$2" want="$3"
  shift 3
  local got
  got=$(printf '%s\n' "$@" | bash tools/ci/changed-areas.sh --files "$base" | tr '\n' ' ')
  for kv in $want; do
    if [[ " $got " != *" $kv "* ]]; then
      echo "FAIL  $desc: want $kv, got: $got"
      fail=1
      return
    fi
  done
  echo "ok    $desc"
}

expect "昇格 PR（main 向け）は全部回す" main \
  "web=true pages=true kiosk=true authz=true shared_db=true python=true" \
  _docs/notes.md

expect "CI 自身を触ったら全部回す" dev \
  "web=true pages=true kiosk=true authz=true shared_db=true python=true walkthroughs=true" \
  .github/workflows/nextjs-web-ci.yml

expect "昇格 PR は通し操作も必ず回す（本番へ上げる前の検査）" main \
  "walkthroughs=true" \
  coolify/apps/nextjs-web/src/components/ui/SearchSelect.tsx

expect "アプリのコードだけの dev 向け PR では通し操作を回さない" dev \
  "web=true pages=true walkthroughs=false" \
  coolify/apps/nextjs-web/src/components/ui/SearchSelect.tsx

expect "通し操作そのものを触ったら回す（web も — 動画の登録簿を試験が読む）" dev \
  "walkthroughs=true pages=true web=true" \
  tools/docs-screenshots/walkthroughs/sales.ts

expect "デモシードは通し操作の土台なので回す" dev \
  "walkthroughs=true shared_db=true" \
  shared-db/sql/production-demo-seed.sql

expect "撮影の manifest だけなら通し操作は回さない" dev \
  "pages=true walkthroughs=false" \
  tools/docs-screenshots/manifest.ts

expect "アプリのコードは web + pages、他は回さない" dev \
  "web=true pages=true kiosk=false authz=false shared_db=false python=false" \
  coolify/apps/nextjs-web/src/components/ui/SearchSelect.tsx

expect "マニュアル本文だけなら pages を飛ばす（build は回す）" dev \
  "web=true pages=false kiosk=false shared_db=false" \
  coolify/apps/nextjs-web/content/manual/operations/sales/quotes/user.md

expect "仕様書・設計メモだけなら web も pages も飛ばす" dev \
  "web=false pages=false kiosk=false authz=false shared_db=false python=false" \
  _specs/tables.md _docs/audits/x.md CLAUDE.md

expect "用語集は i18n 検査が読むので web を回す" dev \
  "web=true pages=false" \
  _specs/i18n-glossary.md

expect "i18n の道具は web を回し、pages は飛ばす" dev \
  "web=true pages=false" \
  tools/i18n/i18n-scan.mjs

expect "マイグレーションは shared-db・web（後方互換ガード）・pages・kiosk（スキーマ）" dev \
  "shared_db=true web=true pages=true" \
  shared-db/prisma/migrations/20261201000000_x/migration.sql

expect "スキーマはキオスクも回す" dev \
  "kiosk=true shared_db=true" \
  shared-db/prisma/schema/sales.prisma

expect "デモシードは shared-db と pages" dev \
  "shared_db=true pages=true web=false" \
  tools/docs-screenshots/sql/system-demo-seed.sql

expect "読み込み確認の道具は pages だけ" dev \
  "pages=true web=false kiosk=false" \
  tools/docs-screenshots/page-load.spec.ts

expect "web の lib は twin file の原本なのでキオスクも回す" dev \
  "kiosk=true web=true" \
  coolify/apps/nextjs-web/src/lib/inventory.ts

expect "Python のサービスは python だけ" dev \
  "python=true web=false pages=false kiosk=false" \
  coolify/apps/intake-gateway/gateway.py

expect "依存の変更はワークスペース全部" dev \
  "web=true pages=true kiosk=true authz=true" \
  pnpm-lock.yaml

expect "authz-core は authz・kiosk・web・pages" dev \
  "authz=true kiosk=true web=true pages=true" \
  packages/authz-core/src/decide.ts

expect "知らない場所のファイルは回す側に倒す" dev \
  "web=true pages=true" \
  some-new-dir/thing.ts

expect "Coolify の他スタックだけなら全部飛ばす" dev \
  "web=false pages=false kiosk=false shared_db=false python=false" \
  coolify/common/nginx-proxy/conf.d/x.conf

exit $fail
