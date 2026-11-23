#!/usr/bin/env bash
# local-check.sh — push する前に、CI と同じものを手元で全部回す（1 コマンド）。
#
#   pnpm check                  # 全部（約 20 分）
#   pnpm check -- --changed     # CI と同じ判定で、触った場所のジョブだけ
#   pnpm check -- --quick       # Docker とブラウザを使わない段だけ（数分）
#
# **AI（Claude 等）が push 前に回すためのもの。** CI の手順は途中で 1 つ落ちると
# 後ろが全部止まるので、ここでは**全段を最後まで回して**から落ちた段をまとめて
# 出す（1 回で全部の赤が見える）。結果は最後の表と、各段のログ。
#
# 段（nextjs-web CI のジョブと同じ並び。CI だけの都合は手元に合わせてある）:
#   setup       pnpm install --frozen-lockfile（ルート / shared-db / docs-screenshots）
#   audit       依存の脆弱性監査（prod・high 以上）
#   python      構文 + intake-gateway / admintools の単体試験（使い捨て venv）
#   authz       packages/authz-core の lint / typecheck / test
#   kiosk       nextjs-kiosk の lint / test / biome strict / tsc / build
#   web         nextjs-web の lint / test / 各 gate / i18n / biome strict /
#               typecheck / build / 図と DSL の一致
#   migrations  適用済みマイグレーションの保護 / まっさらな DB へ migrate deploy /
#               base のデータ入り DB へ head の migration（Docker）
#   browser     使い捨て DB + 本番ビルドで 全画面の読み込み確認（page-load.spec.ts）
#               + e2e-url-state.ts + e2e-client-reads.ts（Docker + Chromium）
#
# CI より厳しい点: main 向けにしか回らない biome strict / typecheck も毎回回す
# （昇格 PR で初めて赤くなるのを手前で止める）。
#
# フラグ:
#   --changed      tools/ci/changed-areas.sh（CI と同じ規則）で段を選ぶ
#   --quick        migrations と browser を飛ばす
#   --base <br>    比較先（既定 dev）。migration 系のガードと --changed が使う
#   --only <段,…>  指定した段だけ（例: --only web,browser）。setup は常に回る
#   --keep         browser の後、アプリと DB を残す（手で触って確かめる用）
#   --fail-fast    最初に落ちた段で止める
#
# 通ると、そのコミットに「合格の印」を残す（.git/ckk-local-check/<sha>）。
# pre-push フック（.githooks/pre-push — pnpm hooks:install で有効化）は印の
# あるコミットなら回し直さずに通す。
#
# 使い捨てのコンテナ名・ポートはワークツリーごとに変わる（パスのハッシュ）。
# 同じ機械で別のワークツリーが同時に回しても互いを消さない。
# 必要なもの: pnpm / node 24 / Docker（migrations・browser）/ python3（python）。
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

BASE=dev
CHANGED=false QUICK=false KEEP=false FAIL_FAST=false ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --changed) CHANGED=true ;;
    --quick) QUICK=true ;;
    --keep) KEEP=true ;;
    --fail-fast) FAIL_FAST=true ;;
    --base) BASE="$2"; shift ;;
    --only) ONLY="$2"; shift ;;
    --) ;;
    -h | --help) sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

# ── 使い捨て資源の名前（ワークツリーごと）────────────────────────────────
SLOT=$(( $(printf '%s' "$ROOT" | cksum | cut -d' ' -f1) % 300 ))
TAG="lc${SLOT}"
DB_FRESH="ckk-${TAG}-fresh"   PORT_FRESH=$((56000 + SLOT))
DB_BASE="ckk-${TAG}-base"     PORT_BASE=$((56300 + SLOT))
DB_APP="ckk-${TAG}-app"       PORT_APP_DB=$((56600 + SLOT))
APP_PORT=$((3300 + SLOT))
APP_URL="http://localhost:${APP_PORT}"
AUTH_SECRET="docs-screenshots-fixed-secret-not-production"
BASE_TREE="${TMPDIR:-/tmp}/ckk-${TAG}-base-tree"

LOG_DIR="${TMPDIR:-/tmp}/ckk-local-check/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$LOG_DIR"

WEB="$ROOT/coolify/apps/nextjs-web"
KIOSK="$ROOT/coolify/apps/nextjs-kiosk"
SHOTS="$ROOT/tools/docs-screenshots"
APP_PID=""

cleanup() {
  docker rm -f "$DB_FRESH" "$DB_BASE" >/dev/null 2>&1
  if [ "$KEEP" = false ]; then
    [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null
    docker rm -f "$DB_APP" >/dev/null 2>&1
  fi
  if [ -d "$BASE_TREE" ]; then
    git -C "$ROOT" worktree remove --force "$BASE_TREE" >/dev/null 2>&1
  fi
}
trap cleanup EXIT

# ── 段の記録 ──────────────────────────────────────────────────────────────
RESULTS=()
FAILED=0
N=0
# step <名前> <コマンド…> — ログに書き、成否と所要時間を記録する
step() {
  local name="$1"
  shift
  N=$((N + 1))
  local log
  log="$LOG_DIR/$(printf '%02d' "$N")-${name//[^A-Za-z0-9._-]/_}.log"
  local t0=$SECONDS
  printf '  … %-58s' "$name"
  if (eval "$*") >"$log" 2>&1; then
    printf 'ok   (%ss)\n' $((SECONDS - t0))
    RESULTS+=("PASS  $name")
  else
    printf 'FAIL (%ss)\n' $((SECONDS - t0))
    RESULTS+=("FAIL  $name  → $log")
    FAILED=$((FAILED + 1))
    echo "------- ${name}（ログ末尾）-------"
    tail -n 30 "$log" | sed 's/^/    /'
    echo "--------------------------------"
    if [ "$FAIL_FAST" = true ]; then summary; exit 1; fi
  fi
}
skip() { RESULTS+=("skip  $1 — $2"); printf '  - %-58s%s\n' "$1" "skip（$2）"; }
section() { echo; echo "■ $1"; }

summary() {
  echo
  echo "================ 結果（ログ: ${LOG_DIR}）================"
  printf '%s\n' "${RESULTS[@]}"
  echo
  if [ "$FAILED" -eq 0 ]; then
    echo "ALL PASS — push してよい"
  else
    echo "$FAILED 段が失敗 — 直してから push すること"
  fi
}

want() {
  # 段を回すか: --only の指定 / --changed の判定 / --quick
  local s="$1"
  if [ -n "$ONLY" ] && [[ ",$ONLY," != *",$s,"* ]]; then return 1; fi
  if [ "$QUICK" = true ] && { [ "$s" = migrations ] || [ "$s" = browser ]; }; then return 1; fi
  if [ "$CHANGED" = true ]; then
    case "$s" in
      audit) return 0 ;;
      browser) [ "$AREA_pages" = true ] ;;
      migrations) [ "$AREA_shared_db" = true ] ;;
      *) local v="AREA_$s"; [ "${!v:-true}" = true ] ;;
    esac
    return
  fi
  return 0
}

need_docker() { docker info >/dev/null 2>&1; }

# psql は手元に無いことが多いので、DB コンテナの中の psql を使う
psql_in() { docker exec -i "$1" psql -U postgres -d ckk -v ON_ERROR_STOP=1 -q; }

wait_db() {
  local c="$1"
  for _ in $(seq 1 60); do
    docker exec "$c" pg_isready -U postgres -d ckk >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

echo "local-check: base=$BASE slot=$SLOT  (app :$APP_PORT, DB :$PORT_FRESH/:$PORT_BASE/:$PORT_APP_DB)"
git fetch --quiet origin "$BASE" || echo "warn: origin/$BASE を fetch できなかった（手元の参照で比べる）"

# ── CI と手元の手順の一致 ─────────────────────────────────────────────────
# CI に 1 行コマンドが足されたのに、ここが知らないまま「手元では全部通った」に
# ならないようにする。${{ … }} 以降は手元では変数になるので比べない。
# 複数行の run: ブロック（grants / cron / 図の一致など）は手で合わせてある。
section "CI との一致"
drift_check() {
  local wf="$ROOT/.github/workflows/nextjs-web-ci.yml" missing=0 cmd
  while IFS= read -r cmd; do
    cmd="${cmd%%\$\{\{*}"
    cmd="${cmd%\"origin/}"
    case "$cmd" in
      "git worktree add"* | "docker rm -f ckk-ci-base-db"*) continue ;; # 手元は別の名前で同じことをする
    esac
    if ! grep -qF -- "$cmd" "$0"; then
      echo "CI にあって local-check.sh に無い: $cmd"
      missing=1
    fi
  done < <(grep -E '^[[:space:]]+run: [^|>]' "$wf" | sed -E 's/^[[:space:]]+run: //')
  return $missing
}
step "CI の 1 行コマンドを全部回しているか" drift_check
step "シェルスクリプトの変数（macOS bash 3.2）" "bash tools/ci/shell-vars-check.sh"

# ── --changed: CI と同じ判定 ──────────────────────────────────────────────
AREA_web=true AREA_pages=true AREA_kiosk=true AREA_authz=true AREA_shared_db=true AREA_python=true AREA_walkthroughs=true
if [ "$CHANGED" = true ]; then
  section "変更範囲の判定（tools/ci/changed-areas.sh, base=origin/${BASE}）"
  step "判定規則の試験" "bash tools/ci/changed-areas.test.sh"
  # コミット済みの差分 + まだコミットしていない変更の両方を見る
  areas=$({ git diff --name-only "origin/$BASE...HEAD"; git diff --name-only HEAD; git ls-files --others --exclude-standard; } \
    | sort -u | bash tools/ci/changed-areas.sh --files "$BASE")
  echo "$areas" | sed 's/^/    /'
  while IFS='=' read -r k v; do eval "AREA_$k=$v"; done <<<"$areas"
fi

# ── setup ────────────────────────────────────────────────────────────────
section "setup"
step "pnpm install --frozen-lockfile（ルート）" "pnpm install --frozen-lockfile"
if want migrations || want browser; then
  step "shared-db install" "cd shared-db && pnpm install --frozen-lockfile --ignore-workspace"
fi
if want browser; then
  step "docs-screenshots install + Chromium" \
    "cd tools/docs-screenshots && pnpm install --frozen-lockfile --ignore-workspace && pnpm exec playwright install chromium"
fi

# ── audit ────────────────────────────────────────────────────────────────
section "audit"
if want audit; then
  step "依存の脆弱性監査 (prod, high+)" "bash tools/ci/dependency-audit.sh"
else skip "依存の脆弱性監査" "--only"; fi

# ── python ───────────────────────────────────────────────────────────────
section "python"
if want python; then
  if command -v python3 >/dev/null; then
    VENV="${TMPDIR:-/tmp}/ckk-local-check-venv"
    [ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
    # CI と同じく素の `python` で呼ぶ（venv を PATH の先頭へ）
    PY_PATH="$VENV/bin:$PATH"
    step "構文（coolify/ 配下の全 .py）" "PATH='$PY_PATH' python tools/ci/python-syntax.py"
    step "intake-gateway — unittest" \
      "cd coolify/apps/intake-gateway && PATH='$PY_PATH' pip install -q -r requirements.txt && PATH='$PY_PATH' python -m unittest discover -s tests -t ."
    step "admintools — unittest" \
      "cd coolify/apps/admintools && PATH='$PY_PATH' python -m unittest discover -s tests -t ."
  else
    skip "python" "python3 が無い"
  fi
else skip "python" "変更なし / --only"; fi

# ── authz-core ───────────────────────────────────────────────────────────
section "authz-core"
if want authz; then
  step "authz-core lint" "cd packages/authz-core && pnpm lint"
  step "authz-core typecheck" "cd packages/authz-core && pnpm typecheck"
  step "authz-core test" "cd packages/authz-core && pnpm test"
else skip "authz-core" "変更なし / --only"; fi

# ── kiosk ────────────────────────────────────────────────────────────────
section "nextjs-kiosk"
if want kiosk; then
  step "kiosk prisma" "cd '$KIOSK' && pnpm db:sync-schema && pnpm db:generate"
  step "kiosk lint" "cd '$KIOSK' && pnpm lint"
  step "kiosk test（twin file の食い違いを含む）" "cd '$KIOSK' && pnpm test"
  step "kiosk biome strict" "cd '$KIOSK' && pnpm exec biome check --error-on-warnings"
  step "kiosk tsc" "cd '$KIOSK' && pnpm exec tsc --noEmit"
  step "kiosk build" "cd '$KIOSK' && pnpm build"
else skip "nextjs-kiosk" "変更なし / --only"; fi

# ── web ──────────────────────────────────────────────────────────────────
section "nextjs-web"
WEB_BUILT=false
# next build が初回だけ「既知の脆弱性がある版です」で止まることがある（版を
# 上げれば出ない）。止まったら 1 回だけ同じコマンドを流し直す。
web_build() {
  (cd "$WEB" && pnpm build) && return 0
  echo "== build を 1 回だけ再試行 =="
  (cd "$WEB" && pnpm build)
}
diagrams_in_sync() {
  if ! git diff --quiet -- coolify/apps/nextjs-web/content/manual/assets/diagrams; then
    echo "スイムレーン図が DSL と食い違っている。node tools/swimlane/build-diagrams.mjs を実行して生成物をコミットすること"
    git diff --stat -- coolify/apps/nextjs-web/content/manual/assets/diagrams
    return 1
  fi
}
if want web || want browser; then
  step "web prisma" "cd '$WEB' && pnpm db:sync-schema && pnpm db:generate"
fi
if want web; then
  step "web lint" "cd '$WEB' && pnpm lint"
  step "web test" "cd '$WEB' && pnpm test"
  step "Page gate guard" "cd '$WEB' && bash scripts/check-page-gates.sh"
  step "Server Action gate guard" "cd '$WEB' && node scripts/check-server-action-gates.mjs"
  step "API gate guard" "cd '$WEB' && node scripts/check-api-gates.mjs"
  step "i18n regression guard" "cd '$WEB' && node ../../../tools/i18n/i18n-scan.mjs"
  step "i18n glossary consistency" "cd '$WEB' && node ../../../tools/i18n/i18n-glossary-check.mjs"
  step "i18n translation keys exist" "cd '$WEB' && node ../../../tools/i18n-unify/verify-keys.mjs"
  step "i18n dynamic key prefixes" "cd '$WEB' && node scripts/check-dynamic-i18n-keys.mjs"
  step "audit table labels" "cd '$WEB' && node scripts/check-audit-table-labels.mjs"
  step "Server Action export guard" "cd '$WEB' && bash scripts/check-use-server-exports.sh"
  step "Migration backward-compat guard" "cd '$WEB' && bash scripts/check-migration-compat.sh \"origin/$BASE\""
  step "web biome strict" "cd '$WEB' && pnpm exec biome check --error-on-warnings"
  step "web typecheck" "cd '$WEB' && pnpm typecheck"
fi
if want web || want browser; then
  step "web build (production)" web_build
  # 直前の段（build）が通ったかは RESULTS の末尾で見る
  [[ "${RESULTS[${#RESULTS[@]}-1]}" == PASS* ]] && WEB_BUILT=true || WEB_BUILT=false
  step "図が DSL と一致" diagrams_in_sync
else skip "nextjs-web" "変更なし / --only"; fi

# ── migrations ───────────────────────────────────────────────────────────
section "shared-db migrations"
start_pg() {
  local name="$1" port="$2" pw="$3"
  docker rm -f "$name" >/dev/null 2>&1
  docker run -d --name "$name" -e POSTGRES_PASSWORD="$pw" -e POSTGRES_DB=ckk \
    -p "127.0.0.1:${port}:5432" --tmpfs /var/lib/postgresql/data groonga/pgroonga:4.0.6-alpine-17 >/dev/null && wait_db "$name"
}
migrate_fresh() {
  set -e
  start_pg "$DB_FRESH" "$PORT_FRESH" postgres
  cd shared-db
  export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${PORT_FRESH}/ckk"
  pnpm exec prisma migrate deploy
  psql_in "$DB_FRESH" < sql/grants.sql
  psql_in "$DB_FRESH" < ci/pg-cron-stub.sql
  for f in sql/*-cron.sql; do
    echo "==> $f"
    sed '/CREATE EXTENSION IF NOT EXISTS pg_cron;/d' "$f" | psql_in "$DB_FRESH"
  done
  psql_in "$DB_FRESH" < sql/analytics-views.sql
  pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema --exit-code
}
migrate_with_data() {
  set -e
  git -C "$ROOT" worktree remove --force "$BASE_TREE" >/dev/null 2>&1 || true
  git -C "$ROOT" worktree add --detach "$BASE_TREE" "origin/$BASE"
  (cd "$BASE_TREE/shared-db" && pnpm install --frozen-lockfile --ignore-workspace)
  (cd "$BASE_TREE/tools/docs-screenshots" && pnpm install --frozen-lockfile --ignore-workspace)
  (cd "$BASE_TREE/tools/docs-screenshots" && SHOT_DB_CONTAINER="$DB_BASE" SHOT_DB_PORT="$PORT_BASE" pnpm docs:seed)
  psql_in "$DB_BASE" < "$BASE_TREE/shared-db/sql/grants.sql"
  psql_in "$DB_BASE" < "$BASE_TREE/shared-db/sql/analytics-views.sql"
  cd shared-db
  export DATABASE_URL="postgresql://postgres:shots@127.0.0.1:${PORT_BASE}/ckk"
  pnpm exec prisma migrate deploy
  psql_in "$DB_BASE" < sql/grants.sql
  psql_in "$DB_BASE" < sql/analytics-views.sql
  pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema --exit-code
}
if want migrations; then
  step "適用済みマイグレーションの保護" "bash shared-db/scripts/check-applied-migrations.sh \"origin/$BASE\""
  if need_docker; then
    step "まっさらな DB へ migrate deploy（+ grants / cron / analytics）" migrate_fresh
    step "base のデータ入り DB へ head の migration" migrate_with_data
  else
    skip "migrate deploy（DB）" "Docker が動いていない"
  fi
else skip "shared-db migrations" "変更なし / --quick / --only"; fi

# ── browser ──────────────────────────────────────────────────────────────
section "browser（使い捨て DB + 本番ビルド）"
start_app() {
  set -e
  (cd "$SHOTS" && SHOT_DB_CONTAINER="$DB_APP" SHOT_DB_PORT="$PORT_APP_DB" pnpm docs:seed)
  cd "$WEB"
  # 本番と同じ TZ（サーバーとブラウザで時刻文字列が割れると hydration #418 が混ざる）
  TZ=Asia/Tokyo NODE_ENV=production AUTH_SECRET="$AUTH_SECRET" AUTH_URL="$APP_URL" \
    DATABASE_URL="postgresql://postgres:shots@127.0.0.1:${PORT_APP_DB}/ckk" \
    nohup pnpm exec next start -p "$APP_PORT" >"$LOG_DIR/app.log" 2>&1 &
  echo $! >"$LOG_DIR/app.pid"
  for _ in $(seq 1 90); do
    curl -sf -o /dev/null "$APP_URL/login" && return 0
    sleep 1
  done
  echo "アプリが起動しない（$LOG_DIR/app.log）"
  return 1
}
if want browser; then
  if ! need_docker; then
    skip "browser" "Docker が動いていない"
  elif [ "$WEB_BUILT" != true ]; then
    skip "browser" "web build が通っていない"
  else
    step "使い捨て DB をシードしてアプリを起動" start_app
    APP_PID=$(cat "$LOG_DIR/app.pid" 2>/dev/null || true)
    if curl -sf -o /dev/null "$APP_URL/login"; then
      step "全画面の読み込み確認（pnpm e2e:pages --reuse）" "cd '$SHOTS' && APP_URL='$APP_URL' pnpm e2e:pages --reuse"
      step "URL の状態（e2e-url-state.ts — IME を含む）" "cd '$SHOTS' && APP_URL='$APP_URL' pnpm exec tsx e2e-url-state.ts"
      step "クライアントの読み取り（e2e-client-reads.ts）" "cd '$SHOTS' && APP_URL='$APP_URL' pnpm exec tsx e2e-client-reads.ts"
      # 通し操作は**最後**: 書類を作って先へ進めるので、同じ DB を読む上の 3 つの
      # 前に走らせると、一覧の先頭行や件数が変わって巻き添えで落ちる。
      if [ "$AREA_walkthroughs" = true ]; then
        step "業務の通し操作（pnpm walk:check --reuse）" "cd '$SHOTS' && APP_URL='$APP_URL' pnpm walk:check --reuse"
      else
        skip "業務の通し操作" "変更なし（昇格 PR では必ず回る）"
      fi
    fi
    if [ "$KEEP" = true ]; then
      echo "  --keep: アプリ ${APP_URL}（demo1 / demo2026）と DB $DB_APP を残した。"
      echo "          片付け: kill $APP_PID; docker rm -f $DB_APP"
    fi
  fi
else skip "browser" "変更なし / --quick / --only"; fi

summary

# ── 合格の印（pre-push フックが読む）──────────────────────────────────────
# 通ったコミットを覚えておき、push のときに同じものを回し直さない
# （.githooks/pre-push）。印を残すのは次の全部を満たすときだけ:
#   - 全段が通った
#   - 段を間引いていない（--quick / --only は印を残さない。--changed は CI と
#     同じ判定なので残す）
#   - 追跡しているファイルに未コミットの変更が無い（あると、通したのは
#     HEAD ではなく手元の状態になる）。.claude* はエージェントの道具が常に
#     書き換えるので数えない
STAMP_DIR="$(git rev-parse --git-common-dir)/ckk-local-check"
if [ "$FAILED" -eq 0 ] && [ "$QUICK" = false ] && [ -z "$ONLY" ]; then
  if git diff --quiet HEAD -- . ':(exclude).claude' ':(exclude).claude-flow'; then
    mkdir -p "$STAMP_DIR"
    mode=full
    [ "$CHANGED" = true ] && mode="changed:$BASE"
    printf '%s %s %s\n' "$(git rev-parse HEAD)" "$mode" "$(date +%Y-%m-%dT%H:%M:%S)" \
      >"$STAMP_DIR/$(git rev-parse HEAD)"
    echo "合格の印を残した: $(git rev-parse --short HEAD)（${mode}）— このコミットは pre-push で回し直さない"
  else
    echo "未コミットの変更があるので合格の印は残さない（コミットしてから回すと push が速い）"
  fi
fi

[ "$FAILED" -eq 0 ]
