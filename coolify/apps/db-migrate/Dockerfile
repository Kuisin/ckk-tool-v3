# db-migrate — applies database migrations on every push, one app per environment.
#
#   db-migrate-dev   branch dev   → ckk-db-dev
#   db-migrate-main  branch main  → ckk-db-main
#
# Coolify rebuilds this app whenever `shared-db/**` changes on its branch, and
# the container applies the migrations as it starts. If anything fails the
# container never becomes healthy, so the deployment is marked failed and the
# error is visible in the Coolify deployment log.
#
# Build context is the repo root (base_directory "/") so `shared-db/` can be
# copied; dockerfile_location is "/coolify/apps/db-migrate/Dockerfile".

FROM node:24-slim

# postgresql-client: for the idempotent .sql artifacts that are re-applied on
# every deploy (grants / cron / analytics views).
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /work/shared-db

# Dependencies first so edits to migrations/SQL don't reinstall the toolchain.
COPY shared-db/package.json shared-db/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY shared-db/ ./
COPY coolify/apps/db-migrate/entrypoint.sh /usr/local/bin/db-migrate-entrypoint
RUN chmod +x /usr/local/bin/db-migrate-entrypoint

# Healthy only after migrations actually succeeded (see entrypoint).
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
  CMD test -f /tmp/migrate-ok || exit 1

CMD ["db-migrate-entrypoint"]
