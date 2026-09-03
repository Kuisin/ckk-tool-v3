# syntax=docker/dockerfile:1
# Multi-stage build for the Next.js app using pnpm + standalone output.
# Build context = REPO ROOT (pnpm workspace) — Coolify: base_directory "/",
# dockerfile_location "/coolify/apps/nextjs-web/Dockerfile".
# Produces a minimal node:24-slim runtime image (techstack: Node standalone).

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Use the pnpm version pinned in package.json#packageManager; allow corepack to
# fetch it without an interactive prompt during the build.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# --- dependencies -----------------------------------------------------------
FROM base AS deps
WORKDIR /app
# lockfile の importer 全員の package.json が必要（workspace 解決のため）。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/authz-core/package.json packages/authz-core/
COPY coolify/apps/nextjs-web/package.json coolify/apps/nextjs-web/
COPY coolify/apps/nextjs-kiosk/package.json coolify/apps/nextjs-kiosk/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter nextjs-web...

# --- build ------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app ./
COPY packages ./packages
# Prisma Client はスキーマ（shared-db から同期した prisma/）だけに依存するので
# アプリソースより前に生成する — ソース変更だけのデプロイではこの層が
# 丸ごとキャッシュヒットする（計測: 約 5.5 秒/デプロイ）。
COPY coolify/apps/nextjs-web/package.json coolify/apps/nextjs-web/prisma.config.ts ./coolify/apps/nextjs-web/
COPY coolify/apps/nextjs-web/prisma ./coolify/apps/nextjs-web/prisma
WORKDIR /app/coolify/apps/nextjs-web
RUN pnpm exec prisma generate
WORKDIR /app
# マニュアルのスイムレーン図は DSL から **ビルドのたびに生成する**
# （pnpm build の先頭 = tools/swimlane/build-diagrams.mjs）。コミット済みの
# SVG を読むだけにしていた頃は、DSL を直しても生成し直し忘れると古い図が
# そのままデプロイされた。依存ゼロの素の node スクリプトなので install は要らない。
# アプリソースより前に置いて、図だけ変えたデプロイでこの層が入れ替わるようにする。
COPY tools/swimlane ./tools/swimlane
COPY coolify/apps/nextjs-web ./coolify/apps/nextjs-web
# このイメージが前提にしているマイグレーション一覧。/api/health がこれと
# _prisma_migrations を突き合わせ、揃うまで unhealthy を返す（デプロイと
# マイグレーションの順序を無関係にするため — lib/schema-readiness.ts）。
# migrations が変わったときだけこの層が焼き直される。
COPY shared-db/prisma/migrations ./shared-db-migrations
RUN find ./shared-db-migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\n' \
      | sort > /app/required-migrations.txt \
  && echo "required migrations: $(wc -l < /app/required-migrations.txt)"
WORKDIR /app/coolify/apps/nextjs-web
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_APP_VERSION=0.1.0
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
# デプロイビルドは型チェックを省く（PR の CI が同じ next build で検証済み）。
# 0 を渡せば従来どおり型チェックする。詳細は next.config.ts のコメント。
ARG NEXT_SKIP_TYPE_CHECK=1
ENV NEXT_SKIP_TYPE_CHECK=$NEXT_SKIP_TYPE_CHECK
# メモリの少ないビルドホスト用の任意ノブ（バイト値 → next.config.ts の
# experimental.turbopackMemoryLimit）。未指定なら無効。
ARG TURBOPACK_MEMORY_LIMIT=
ENV TURBOPACK_MEMORY_LIMIT=$TURBOPACK_MEMORY_LIMIT
# Prisma Client は上（アプリソース COPY の前）で生成済み。
RUN pnpm build

# --- runtime ----------------------------------------------------------------
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs

# Standalone server + static assets. outputFileTracingRoot = repo root なので
# standalone 内はワークスペースのディレクトリ構造を保つ:
#   .next/standalone/coolify/apps/nextjs-web/server.js
COPY --from=builder --chown=nextjs:nodejs /app/coolify/apps/nextjs-web/.next/standalone ./
COPY --from=builder /app/coolify/apps/nextjs-web/public ./coolify/apps/nextjs-web/public
COPY --from=builder --chown=nextjs:nodejs /app/coolify/apps/nextjs-web/.next/static ./coolify/apps/nextjs-web/.next/static
# server.js は /app から起動するので、readiness の既定パスもここ。
COPY --from=builder --chown=nextjs:nodejs /app/required-migrations.txt ./required-migrations.txt

# スキーマ準備の待ち合わせ。**既定は無効**で、環境ごとに Coolify の env で
# SCHEMA_READINESS_GATE=1 を入れたところだけ有効になる（まず dev で確かめる）。
#
# 有効なとき /api/health は、このイメージが前提にするマイグレーションが全部
# 当たるまで 503 を返す。Coolify は healthy になるまで新コンテナを公開しない
# ので、**デプロイが先に来ても 500 を出さずに migrator を待つ**（その間は
# 旧コンテナが serving を続けるので無停止）。
#
# start-period が長くても、スキーマが揃っていれば最初の probe で healthy に
# なるため通常のデプロイは遅くならない。長さが効くのは「待っている間」だけ。
ENV SCHEMA_READINESS_GATE=0
HEALTHCHECK --interval=10s --timeout=5s --start-period=300s --retries=30 \
  CMD node -e "if(process.env.SCHEMA_READINESS_GATE!=='1')process.exit(0);fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER nextjs
EXPOSE 3000
CMD ["node", "coolify/apps/nextjs-web/server.js"]
