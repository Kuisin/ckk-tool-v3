# syntax=docker/dockerfile:1
# Multi-stage build for the Next.js app using pnpm + standalone output.
# Build context = REPO ROOT (pnpm workspace) — Coolify: base_directory "/",
# dockerfile_location "/docker-compose/nextjs-web/Dockerfile".
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
COPY docker-compose/nextjs-web/package.json docker-compose/nextjs-web/
COPY docker-compose/nextjs-kiosk/package.json docker-compose/nextjs-kiosk/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter nextjs-web...

# --- build ------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app ./
COPY packages ./packages
COPY docker-compose/nextjs-web ./docker-compose/nextjs-web
WORKDIR /app/docker-compose/nextjs-web
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_APP_VERSION=0.1.0
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
# Prisma Client from the synced shared-db schema (prisma/schema).
RUN pnpm exec prisma generate
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
#   .next/standalone/docker-compose/nextjs-web/server.js
COPY --from=builder --chown=nextjs:nodejs /app/docker-compose/nextjs-web/.next/standalone ./
COPY --from=builder /app/docker-compose/nextjs-web/public ./docker-compose/nextjs-web/public
COPY --from=builder --chown=nextjs:nodejs /app/docker-compose/nextjs-web/.next/static ./docker-compose/nextjs-web/.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "docker-compose/nextjs-web/server.js"]
