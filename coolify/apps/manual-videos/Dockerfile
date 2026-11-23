# syntax=docker/dockerfile:1
# manual-videos — マニュアルの動画（業務の通し操作）を録画する。1 環境 1 アプリ。
#
#   manual-videos-dev   branch dev   → /home/kaiseisawada/manual-videos/dev
#   manual-videos-main  branch main  → /home/kaiseisawada/manual-videos/main
#
# 動画は git にもアプリのイメージにも入れない。**リポジトリにあるのはスクリプトだけ**で
# （tools/docs-screenshots/walkthroughs/）、このコンテナが起動時にそれを走らせて
# 録画し、ホストのディレクトリへ書き出す。nextjs-web は同じディレクトリを読み取り
# 専用で mount して /manual-media で配る。
#
# **アプリのデプロイとは別**（db-migrate が shared-db/** でだけ動くのと同じ）:
# watch_paths は通し操作のスクリプトとこのディレクトリだけなので、ふだんのアプリの
# push では動かない。画面の見た目が変わって撮り直したいときは
# `coolify/platform/deploy.sh manual-videos-dev` を手で流す。
#
# 中身は 1 コンテナで完結する:
#   - Postgres（PGroonga）— **このコンテナの中の使い捨て**。tmpfs 相当の一時領域に
#     initdb し、デモシードを入れ、録画が終われば捨てる。ckk-db-dev / ckk-db-main には
#     **一切つながない**（接続先を渡していない）
#   - nextjs-web — イメージのビルド時に production build したもの
#   - Chromium（Playwright）— 録画する
#
# Build context = REPO ROOT（base_directory "/"、
# dockerfile_location "/coolify/apps/manual-videos/Dockerfile"）。

# ベースは PGroonga 入りの Postgres（CI・撮影と同じ版の Debian 版）。Alpine 版は
# 使えない — Playwright の Chromium は musl で動かない。
FROM node:24-bookworm-slim AS node

FROM groonga/pgroonga:4.0.6-debian-17

# Node 24（アプリと同じ版）。公式イメージから実行ファイルごと持ってくる。
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack \
 && ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN corepack enable

# 日本語フォント。アプリは Noto Sans JP を指定しているが、Web フォントとして
# 配ってはいない（利用者の端末のフォントで描く）。入れないと録画の文字が全部
# 豆腐（□）になる。gzip はレガシー import（.sql.gz）の展開用。
#
# ベースイメージには PGroonga を入れるための外部 apt ソース（Apache Arrow /
# Groonga）が残っていて、署名鍵が期限切れだと `apt-get update` 全体が落ちる
# （実際に Arrow の鍵で落ちた）。PGroonga はもう入っているので、Debian 本体以外の
# ソースを外してから使う — 下の Playwright（--with-deps）も apt を使う。
RUN find /etc/apt/sources.list.d -type f ! -name 'debian.sources' -delete \
 && apt-get update \
 && apt-get install -y --no-install-recommends fonts-noto-cjk ca-certificates gzip \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /repo

# ── 依存（変わりにくい順）────────────────────────────────────────────────────
# Chromium と OS の依存は Playwright の版にしか依らないので最初に入れる —
# スクリプトやアプリを直しただけのデプロイでは、この重い層がキャッシュに当たる。
COPY tools/docs-screenshots/package.json tools/docs-screenshots/pnpm-lock.yaml tools/docs-screenshots/.npmrc tools/docs-screenshots/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    cd tools/docs-screenshots \
 && pnpm install --frozen-lockfile --ignore-workspace \
 && pnpm exec playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/*

COPY shared-db/package.json shared-db/pnpm-lock.yaml shared-db/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    cd shared-db && pnpm install --frozen-lockfile --ignore-workspace --ignore-scripts

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/authz-core/package.json packages/authz-core/
COPY coolify/apps/nextjs-web/package.json coolify/apps/nextjs-web/
COPY coolify/apps/nextjs-kiosk/package.json coolify/apps/nextjs-kiosk/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter nextjs-web...

# ── アプリ（録画する対象）───────────────────────────────────────────────────
COPY packages ./packages
COPY shared-db ./shared-db
COPY tools/swimlane ./tools/swimlane
COPY coolify/apps/nextjs-web ./coolify/apps/nextjs-web
# スキーマは shared-db が正。nextjs-web の prisma/schema は同期した写しなので、
# ここでも同期し直してから生成する（CI の walkthroughs ジョブと同じ手順）。
RUN cd coolify/apps/nextjs-web && pnpm db:sync-schema && pnpm db:generate
# フッターに出る版は撮影と同じ固定値（録画のたびに変わらないように）。
RUN cd coolify/apps/nextjs-web \
 && NEXT_PUBLIC_APP_VERSION=0.1.0-local NEXT_SKIP_TYPE_CHECK=1 pnpm build

# ── 通し操作のスクリプト（いちばん変わりやすいので最後）─────────────────────
COPY tools/data-migration/imports ./tools/data-migration/imports
COPY tools/docs-screenshots ./tools/docs-screenshots

COPY coolify/apps/manual-videos/entrypoint.sh /usr/local/bin/manual-videos-entrypoint
RUN chmod +x /usr/local/bin/manual-videos-entrypoint

# 録画が最後まで通ったときだけ healthy（entrypoint が /tmp/videos-ok を置く）。
# 録画は 10 分前後かかるので、待てる上限は長く取る: 30s + 15s × 160 = 約 40 分。
# start-period を短くしてあるのは db-migrate と同じ理由（Coolify は start-period を
# 丸ごと待つ）。途中で落ちたときは entrypoint が非 0 で終了するので、上限を待たずに
# デプロイが失敗になる。
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=160 \
  CMD test -f /tmp/videos-ok || exit 1

# ベースイメージの ENTRYPOINT（postgres を起動するもの）は使わない —
# こちらの entrypoint が必要なときに自分で呼ぶ。
ENTRYPOINT []
CMD ["manual-videos-entrypoint"]
