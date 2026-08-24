#!/bin/sh
# Create the app roles on first cluster init (empty data directory only).
#
# Schemas, grants and data come later and automatically: the db-migrate app
# runs `prisma migrate deploy` (baseline + seed migrations) and then
# `shared-db/sql/grants.sql`.
#
# Every password is required — a role silently created without one would let
# the corresponding service fail later with a confusing auth error.
set -eu

: "${KOT_DB_PASSWORD:?KOT_DB_PASSWORD is required}"
: "${LDAP_SYNC_DB_PASSWORD:?LDAP_SYNC_DB_PASSWORD is required}"
: "${ADMINTOOLS_DB_PASSWORD:?ADMINTOOLS_DB_PASSWORD is required}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"
: "${KOT_RO_DB_PASSWORD:?KOT_RO_DB_PASSWORD is required}"
: "${METABASE_RO_DB_PASSWORD:?METABASE_RO_DB_PASSWORD is required}"
: "${FX_DB_PASSWORD:?FX_DB_PASSWORD is required}"
: "${STUDIO_RO_DB_PASSWORD:?STUDIO_RO_DB_PASSWORD is required}"
: "${BACKUP_DB_PASSWORD:?BACKUP_DB_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
  CREATE ROLE kot         LOGIN PASSWORD '${KOT_DB_PASSWORD}';
  CREATE ROLE ldap_sync   LOGIN PASSWORD '${LDAP_SYNC_DB_PASSWORD}';
  CREATE ROLE admintools  LOGIN PASSWORD '${ADMINTOOLS_DB_PASSWORD}';
  CREATE ROLE app         LOGIN PASSWORD '${APP_DB_PASSWORD}';
  CREATE ROLE kot_ro      LOGIN PASSWORD '${KOT_RO_DB_PASSWORD}';
  CREATE ROLE metabase_ro LOGIN PASSWORD '${METABASE_RO_DB_PASSWORD}';
  CREATE ROLE fx_rates    LOGIN PASSWORD '${FX_DB_PASSWORD}';
  CREATE ROLE studio_ro   LOGIN PASSWORD '${STUDIO_RO_DB_PASSWORD}';
  CREATE ROLE backup      REPLICATION LOGIN PASSWORD '${BACKUP_DB_PASSWORD}';
EOSQL
