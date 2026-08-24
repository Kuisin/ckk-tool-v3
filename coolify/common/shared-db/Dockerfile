# shared-db image = PGroonga base + pg_cron (built from source).
#
# pg_cron is used for the kiosk presence backstop jobs
# (shared-db/sql/kiosk-cron.sql): offline detection when the kiosk app itself
# is down, and stale-session cleanup. The PGroonga alpine image ships build
# headers via postgres:17-alpine, so a multi-stage source build works.
#
# NOTE: enabling pg_cron also needs `shared_preload_libraries=pg_cron` +
# `cron.database_name=ckk` in docker-compose.yml `command` — applying that
# recreates the container (a few seconds of DB downtime; deploy at a quiet
# moment, same caveat as summarize_wal).

FROM groonga/pgroonga:4.0.6-alpine-17 AS build

ARG PG_CRON_VERSION=1.6.7

# with_llvm=no: skip JIT bitcode — avoids pinning clang/llvm package names to
# the alpine release; pg_cron gains nothing from JIT.
RUN apk add --no-cache build-base curl \
 && curl -fsSL "https://github.com/citusdata/pg_cron/archive/refs/tags/v${PG_CRON_VERSION}.tar.gz" | tar xz \
 && cd "pg_cron-${PG_CRON_VERSION}" \
 && make with_llvm=no \
 && make with_llvm=no install

FROM groonga/pgroonga:4.0.6-alpine-17

COPY --from=build /usr/local/lib/postgresql/pg_cron.so /usr/local/lib/postgresql/
COPY --from=build /usr/local/share/postgresql/extension/pg_cron* /usr/local/share/postgresql/extension/
