# syntax=docker/dockerfile:1
# nextjs-kiosk — Next.js + カスタムサーバー（WebSocket /api/kiosk/ws）。
# nextjs-web と違い standalone を使わない（custom server が upgrade を扱うため）。
# Build context = REPO ROOT (pnpm workspace) — Coolify: base_directory "/",
# dockerfile_location "/docker-compose/nextjs-kiosk/Dockerfile"。
# ランタイム = pnpm deploy の prod node_modules + .next + dist(コンパイル済みサーバー)。

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# --- dependencies -----------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/authz-core/package.json packages/authz-core/
COPY docker-compose/nextjs-web/package.json docker-compose/nextjs-web/
COPY docker-compose/nextjs-kiosk/package.json docker-compose/nextjs-kiosk/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter nextjs-kiosk...

# --- build ------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app ./
COPY packages ./packages
COPY docker-compose/nextjs-kiosk ./docker-compose/nextjs-kiosk
WORKDIR /app/docker-compose/nextjs-kiosk
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_APP_VERSION=0.1.0
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
# Prisma Client from the synced shared-db schema (prisma/schema).
RUN pnpm exec prisma generate
RUN pnpm build

# --- prod deps (materialized) ------------------------------------------------
# pnpm deploy = workspace 依存（@ckk/authz-core 含む）を実体コピーした
# デプロイ用ツリーを /out に生成する（シンボリックリンクなし）。
FROM base AS proddeps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY docker-compose/nextjs-web/package.json docker-compose/nextjs-web/
COPY docker-compose/nextjs-kiosk/package.json docker-compose/nextjs-kiosk/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter nextjs-kiosk --prod deploy --legacy /out

# --- runtime ----------------------------------------------------------------
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs

COPY --from=proddeps /out/node_modules ./node_modules
COPY --from=proddeps /out/package.json ./package.json
COPY --from=builder /app/docker-compose/nextjs-kiosk/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/docker-compose/nextjs-kiosk/.next ./.next
COPY --from=builder /app/docker-compose/nextjs-kiosk/dist ./dist

USER nextjs
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
