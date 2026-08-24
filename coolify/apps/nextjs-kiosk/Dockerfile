# syntax=docker/dockerfile:1
# nextjs-kiosk — Next.js + カスタムサーバー（WebSocket /api/kiosk/ws）。
# nextjs-web と違い standalone を使わない（custom server が upgrade を扱うため）。
# Build context = REPO ROOT (pnpm workspace) — Coolify: base_directory "/",
# dockerfile_location "/coolify/apps/nextjs-kiosk/Dockerfile"。
#
# ランタイムは builder のディレクトリレイアウトをそのまま維持する:
#   /app/node_modules（workspace ルートの .pnpm ストア）
#   /app/packages/…（workspace パッケージ）
#   /app/coolify/apps/nextjs-kiosk/{node_modules,.next,dist,public}
# 理由: Next 16 は外部化パッケージ（@prisma/client-<hash>・pg-<hash> 等）を
# .next/node_modules に「ルートストアへの相対シンボリックリンク」で出力する。
# レイアウトを変える（pnpm deploy 等）とリンク先が消え、起動後に
# "Failed to load external module …" で全 SSR/API が 500 になる。
# （dev 依存も含むためイメージは大きめ — 最適化するなら prune 方式を要検証）

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
COPY coolify/apps/nextjs-web/package.json coolify/apps/nextjs-web/
COPY coolify/apps/nextjs-kiosk/package.json coolify/apps/nextjs-kiosk/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter nextjs-kiosk...

# --- build ------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app ./
COPY packages ./packages
# Prisma Client はスキーマ（shared-db から同期した prisma/）だけに依存するので
# アプリソースより前に生成する — ソース変更だけのデプロイではこの層が
# 丸ごとキャッシュヒットする。
COPY coolify/apps/nextjs-kiosk/package.json coolify/apps/nextjs-kiosk/prisma.config.ts ./coolify/apps/nextjs-kiosk/
COPY coolify/apps/nextjs-kiosk/prisma ./coolify/apps/nextjs-kiosk/prisma
WORKDIR /app/coolify/apps/nextjs-kiosk
RUN pnpm exec prisma generate
WORKDIR /app
COPY coolify/apps/nextjs-kiosk ./coolify/apps/nextjs-kiosk
WORKDIR /app/coolify/apps/nextjs-kiosk
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_APP_VERSION=0.1.0
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
# デプロイビルドは next build 内の型チェックを省く（PR の CI が検証済み。
# build:server の tsc は従来どおり走る）。0 を渡せば従来どおり。
ARG NEXT_SKIP_TYPE_CHECK=1
ENV NEXT_SKIP_TYPE_CHECK=$NEXT_SKIP_TYPE_CHECK
RUN pnpm build

# --- runtime ----------------------------------------------------------------
FROM node:24-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs

# workspace レイアウトを builder と同一に保つ（シンボリックリンク解決のため）
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/coolify/apps/nextjs-kiosk/package.json /app/coolify/apps/nextjs-kiosk/package.json
COPY --from=builder /app/coolify/apps/nextjs-kiosk/node_modules /app/coolify/apps/nextjs-kiosk/node_modules
COPY --from=builder /app/coolify/apps/nextjs-kiosk/public /app/coolify/apps/nextjs-kiosk/public
COPY --from=builder --chown=nextjs:nodejs /app/coolify/apps/nextjs-kiosk/.next /app/coolify/apps/nextjs-kiosk/.next
COPY --from=builder /app/coolify/apps/nextjs-kiosk/dist /app/coolify/apps/nextjs-kiosk/dist
# 生成 Prisma Client（.next のシンボリックリンク先ではないが、dist からの相対
# import に備え同梱 — ビルダーと同位置）
COPY --from=builder /app/coolify/apps/nextjs-kiosk/generated /app/coolify/apps/nextjs-kiosk/generated

WORKDIR /app/coolify/apps/nextjs-kiosk
USER nextjs
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
