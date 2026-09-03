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
#
# ★ **start-period は短く、retries は多く。** Coolify は start-period を
#   「最初の判定までに待つ時間」として**丸ごと待つ**（成功しても切り上げない）。
#   180s にしていた頃は、2 秒で終わった移行のあと 3 分間ただ待っていて、
#   デプロイ 6 分のうち半分がこの数字だった。
#
#   遅い移行を殺さないための余裕は retries 側で取る。ここは
#   10s + 10s × 60 = 最大 610s まで待てるので、以前の 270s より**むしろ寛容**で、
#   かつ終わった 10 秒後には healthy になる。
#
#   移行そのものが失敗したときは entrypoint が set -e で落ちてコンテナが
#   終了するので、retries を使い切るのを待たずにデプロイが失敗する。
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=60 \
  CMD test -f /tmp/migrate-ok || exit 1

CMD ["db-migrate-entrypoint"]
