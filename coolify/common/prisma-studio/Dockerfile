# syntax=docker/dockerfile:1
# Prisma Studio — read-only browser for the shared CKK database.
# Reads prisma/schema (a synced copy of shared-db's source of truth) and serves
# the Studio UI on :5555. Connects as studio_ro (SELECT on every schema).
#
# Uses npm (not pnpm) so Prisma's postinstall engine setup runs without pnpm's
# build-script approval gate.

FROM node:24-slim
# Prisma's query engine is dynamically linked against libssl.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY prisma.config.ts ./
COPY prisma ./prisma

# Studio must not try to open a local browser inside the container.
ENV BROWSER=none
EXPOSE 5555
CMD ["npx", "prisma", "studio", "--port", "5555", "--browser", "none"]
