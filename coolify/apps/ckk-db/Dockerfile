# ckk-db — the business database, built and run by Coolify (one per environment).
#
#   ckk-db-dev   branch dev   → network alias ckk-db-dev
#   ckk-db-main  branch main  → network alias ckk-db-main
#
# Dev and production share NOTHING: separate containers, separate volumes,
# separate credentials. This replaces the single `shared-db` stack that both
# environments used to point at.
#
# Everything the server-side compose file used to supply (postgres flags,
# pg_hba, role bootstrap) is baked into the image, because a Coolify
# application has no compose file to carry them.
#
# Contents:
#   PGroonga  — full-text search (PGroonga index types are used by the app)
#   pg_cron   — kiosk presence backstop jobs (shared-db/sql/kiosk-cron.sql)
#
# Schema/data provisioning is NOT done here — the db-migrate app applies
# `prisma migrate deploy` (which now also carries the seed data) on every push.

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

# Role bootstrap — runs once, on an empty data directory.
COPY init/ /docker-entrypoint-initdb.d/

# Replication rule for the db-backup stack's `backup` role (the image default
# only allows replication from localhost).
COPY conf/pg_hba.conf /etc/postgresql/pg_hba.conf

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD pg_isready -U postgres -d "${POSTGRES_DB:-ckk}" || exit 1

EXPOSE 5432

# summarize_wal: required for the db-backup stack's incremental base backups.
# pg_cron must be preloaded and told which database its job tables live in.
CMD ["postgres", \
     "-c", "summarize_wal=on", \
     "-c", "hba_file=/etc/postgresql/pg_hba.conf", \
     "-c", "shared_preload_libraries=pg_cron", \
     "-c", "cron.database_name=ckk"]
