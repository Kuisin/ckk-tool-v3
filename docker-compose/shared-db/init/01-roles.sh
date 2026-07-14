#!/bin/sh
# Create app roles on first cluster init. Schemas + grants come later:
# Prisma migration creates the schemas, then shared-db/sql/grants.sql is
# applied once as postgres.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
  CREATE ROLE kot        LOGIN PASSWORD '${KOT_DB_PASSWORD}';
  CREATE ROLE ldap_sync  LOGIN PASSWORD '${LDAP_SYNC_DB_PASSWORD}';
  CREATE ROLE admintools LOGIN PASSWORD '${ADMINTOOLS_DB_PASSWORD}';
  CREATE ROLE app        LOGIN PASSWORD '${APP_DB_PASSWORD}';
  CREATE ROLE kot_ro     LOGIN PASSWORD '${KOT_RO_DB_PASSWORD}';
  CREATE ROLE studio_ro  LOGIN PASSWORD '${STUDIO_RO_DB_PASSWORD}';
  CREATE ROLE backup     REPLICATION LOGIN PASSWORD '${BACKUP_DB_PASSWORD}';
EOSQL
