#!/usr/bin/env bash
# changed-areas.sh — PR の変更ファイルから「どの CI ジョブが要るか」を決める。
#
# nextjs-web CI（.github/workflows/nextjs-web-ci.yml）の `changes` ジョブが使う。
# 目的は Actions の分を節約すること — 以前は PR 1 本・push 1 回ごとに 9 ジョブ
# 約 20 分を全部回しており、その 2/3 は全画面の読み込み確認（約 13 分）だった。
#
# 迷ったら**回す側**へ倒すのが約束:
#   - main 向け（dev → main の昇格 PR）は常に全部回す
#   - この CI 自身（ワークフロー・このスクリプト）を触ったら全部回す
#   - web / pages は「飛ばしてよいファイルだけ」の PR でだけ飛ばす（除外リスト）。
#     知らない場所のファイルは回す側に数えられる
#   - shared-db / python / kiosk / authz-core は対象がはっきりしているので
#     「この場所を触ったら回す」（対象リスト）
#
# 使い方:
#   bash tools/ci/changed-areas.sh <base-ref> [base-branch]   # git diff base...HEAD
#   printf '%s\n' a.ts b.md | bash tools/ci/changed-areas.sh --files [base-branch]
# 出力（GITHUB_OUTPUT にそのまま足せる形）:
#   web=true  pages=false  kiosk=…  authz=…  shared_db=…  python=…  walkthroughs=…
#
# 規則を変えたら tools/ci/changed-areas.test.sh を足すこと（CI が先に流す）。
set -euo pipefail

if [ "${1:-}" = "--files" ]; then
  files=$(cat)
  base_branch="${2:-dev}"
else
  base_ref="${1:?base ref (例: origin/dev)}"
  base_branch="${2:-${base_ref#origin/}}"
  files=$(git diff --name-only "${base_ref}...HEAD")
fi

web=false pages=false kiosk=false authz=false shared_db=false python=false walkthroughs=false

all_true() {
  web=true pages=true kiosk=true authz=true shared_db=true python=true walkthroughs=true
}

# web ジョブ（lint / 単体試験 / 各 gate / i18n / build）を飛ばしてよいファイル。
# アプリにもビルドにも入らないものだけ。用語集は i18n 検査が読むので**入れない**。
skip_web() {
  case "$1" in
    _specs/i18n-glossary.md) return 1 ;;
    _docs/* | _specs/* | _assets/*) return 0 ;;
    .claude/* | .claude-flow/*) return 0 ;;
    external/* | design-preview/*) return 0 ;;
    coolify/common/* | coolify/platform/*) return 0 ;;
    coolify/apps/nextjs-web/* | coolify/apps/nextjs-kiosk/*) return 1 ;;
    coolify/apps/*) return 0 ;; # Python のサービス等（別ジョブが見る）
    # 動画の登録簿。マニュアル本文の ```video フェンスと突き合わせる単体試験
    # （nextjs-web の manual-videos-content.test.ts）が読むので web を回す。
    tools/docs-screenshots/walkthroughs/*) return 1 ;;
    tools/docs-screenshots/*) return 0 ;; # pages ジョブの持ち物
    tools/ci/python-syntax.py) return 0 ;;
    .github/workflows/nextjs-web-ci.yml) return 1 ;;
    .github/*) return 0 ;;
    *.md) return 0 ;; # README / CLAUDE.md（content/ の下は上で app 扱い済み）
    *) return 1 ;;
  esac
}

# 全画面の読み込み確認（約 13 分）を飛ばしてよいファイル。web で飛ばせるものに
# 加えて、画面の動きを変えない文書・道具。マニュアル本文（content/）も含む —
# 本文の壊れは build（web ジョブ）が止め、昇格 PR では必ずこのジョブが回る。
# デモシード（shared-db・tools/docs-screenshots）は読み込み確認の土台なので**回す**。
skip_pages() {
  case "$1" in
    tools/docs-screenshots/*) return 1 ;;
    coolify/apps/nextjs-web/content/*) return 0 ;;
    _specs/*) return 0 ;; # 用語集も含む（読むのは i18n 検査 = web ジョブ）
    tools/*) return 0 ;; # i18n 検査・スイムレーン・CI の道具
  esac
  skip_web "$1"
}

if [ "$base_branch" = "main" ]; then
  all_true
else
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    case "$f" in
      .github/workflows/nextjs-web-ci.yml | tools/ci/changed-areas.sh | tools/ci/changed-areas.test.sh)
        all_true
        break
        ;;
    esac
    skip_web "$f" || web=true
    skip_pages "$f" || pages=true
    case "$f" in
      shared-db/* | tools/docs-screenshots/sql/*) shared_db=true ;;
    esac
    case "$f" in
      *.py | */requirements*.txt | coolify/apps/intake-gateway/* | coolify/apps/admintools/*) python=true ;;
    esac
    case "$f" in
      packages/authz-core/*) authz=true ;;
    esac
    # キオスク: 自分の中身・共有パッケージ・スキーマ・依存。nextjs-web/src/lib は
    # twin file（逐語コピー）の原本があり、キオスクの試験が食い違いを見る。
    case "$f" in
      coolify/apps/nextjs-kiosk/* | coolify/apps/nextjs-web/src/lib/* | packages/* | shared-db/prisma/schema/*) kiosk=true ;;
    esac
    # 業務の通し操作（walkthroughs ジョブ・約 10 分）。**dev 向けの PR では、通し操作
    # 自身かその土台（デモシード・ログイン・シードの流し方）を触ったときだけ回す** —
    # アプリのコードを触るたびに回すと全 PR が 10 分延び、しかも通し操作はシードの
    # 中身に依るので、関係のない PR が種の変更で落ちる。アプリ側の壊れは昇格 PR
    # （main 向け = 上の all_true）で必ず見る: 本番へ上がる前に止めるのが役目。
    case "$f" in
      tools/docs-screenshots/walkthroughs/* | tools/docs-screenshots/walkthroughs.spec.ts | \
        tools/docs-screenshots/playwright.walkthroughs.config.ts | \
        tools/docs-screenshots/scripts/walkthroughs.ts | tools/docs-screenshots/scripts/orchestrate.ts | \
        tools/docs-screenshots/global-setup.ts | tools/docs-screenshots/console-ignore.ts | \
        tools/docs-screenshots/package.json | tools/docs-screenshots/pnpm-lock.yaml | \
        shared-db/sql/*-seed.sql)
        walkthroughs=true
        ;;
    esac
    # 依存の変更はワークスペースの全部に効く
    case "$f" in
      pnpm-lock.yaml | package.json | pnpm-workspace.yaml)
        web=true pages=true kiosk=true authz=true
        ;;
    esac
  done <<<"$files"
fi

echo "web=$web"
echo "pages=$pages"
echo "kiosk=$kiosk"
echo "authz=$authz"
echo "shared_db=$shared_db"
echo "python=$python"
echo "walkthroughs=$walkthroughs"
