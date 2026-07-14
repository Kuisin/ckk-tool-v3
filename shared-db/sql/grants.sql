-- Role grants + search_path for the CKK shared DB.
-- Run once as postgres AFTER the initial Prisma migration created the schemas:
--   docker exec -i shared-db psql -U postgres -d ckk < grants.sql
-- Idempotent. Default privileges cover tables added by future migrations
-- (Prisma migrations run as postgres, so postgres is always the grantor).

-- ── search_path per role ─────────────────────────────────────────────
-- Apps use unqualified table names; the first schema in the path is where
-- their CREATE TABLE IF NOT EXISTS statements resolve (must be the schema
-- that already owns their tables).
ALTER ROLE kot        IN DATABASE ckk SET search_path = kot, directory;
ALTER ROLE ldap_sync  IN DATABASE ckk SET search_path = directory, kot;
ALTER ROLE admintools IN DATABASE ckk SET search_path = admintools;
ALTER ROLE kot_ro     IN DATABASE ckk SET search_path = kot, directory;
ALTER ROLE studio_ro  IN DATABASE ckk SET search_path = app, kot, directory, admintools;

-- ── kot: KOT importer + admintools match_employees ───────────────────
-- CREATE on schema kot: the apps run legacy `CREATE TABLE IF NOT EXISTS`
-- statements at startup — Postgres checks schema CREATE privilege even
-- when the table already exists.
GRANT USAGE, CREATE ON SCHEMA kot TO kot;
GRANT USAGE ON SCHEMA directory TO kot;
GRANT ALL ON ALL TABLES IN SCHEMA kot TO kot;
GRANT ALL ON ALL SEQUENCES IN SCHEMA kot TO kot;
GRANT SELECT ON ALL TABLES IN SCHEMA directory TO kot;
ALTER DEFAULT PRIVILEGES IN SCHEMA kot GRANT ALL ON TABLES TO kot;
ALTER DEFAULT PRIVILEGES IN SCHEMA kot GRANT ALL ON SEQUENCES TO kot;
ALTER DEFAULT PRIVILEGES IN SCHEMA directory GRANT SELECT ON TABLES TO kot;

-- ── ldap_sync: owns the directory tables + upserts kot.employees ─────
-- Ownership needed: sync.py runs CREATE INDEX IF NOT EXISTS at startup,
-- which requires table ownership even when the index already exists.
-- Prisma migrations still work (they run as postgres, superuser).
GRANT USAGE, CREATE ON SCHEMA directory TO ldap_sync;
GRANT USAGE ON SCHEMA kot TO ldap_sync;
ALTER TABLE directory.employee_directory OWNER TO ldap_sync;
ALTER TABLE directory.ldap_sync_log OWNER TO ldap_sync;
ALTER SEQUENCE directory.ldap_sync_log_id_seq OWNER TO ldap_sync;
GRANT ALL ON ALL TABLES IN SCHEMA directory TO ldap_sync;
GRANT ALL ON ALL SEQUENCES IN SCHEMA directory TO ldap_sync;
GRANT SELECT ON ALL TABLES IN SCHEMA kot TO ldap_sync;
GRANT INSERT, UPDATE ON kot.employees TO ldap_sync;
ALTER DEFAULT PRIVILEGES IN SCHEMA directory GRANT ALL ON TABLES TO ldap_sync;
ALTER DEFAULT PRIVILEGES IN SCHEMA directory GRANT ALL ON SEQUENCES TO ldap_sync;
ALTER DEFAULT PRIVILEGES IN SCHEMA kot GRANT SELECT ON TABLES TO ldap_sync;

-- ── admintools ───────────────────────────────────────────────────────
-- The app self-migrates at startup (ALTER TABLE ... ADD COLUMN IF NOT
-- EXISTS), which requires table OWNERSHIP — so admintools owns its own
-- tables. Prisma migrations still work (they run as postgres, superuser).
GRANT USAGE, CREATE ON SCHEMA admintools TO admintools;
GRANT ALL ON ALL TABLES IN SCHEMA admintools TO admintools;
GRANT ALL ON ALL SEQUENCES IN SCHEMA admintools TO admintools;
ALTER DEFAULT PRIVILEGES IN SCHEMA admintools GRANT ALL ON TABLES TO admintools;
ALTER DEFAULT PRIVILEGES IN SCHEMA admintools GRANT ALL ON SEQUENCES TO admintools;
ALTER TABLE admintools.mail_accounts OWNER TO admintools;
ALTER TABLE admintools.group_members OWNER TO admintools;
ALTER SEQUENCE admintools.mail_accounts_id_seq OWNER TO admintools;
ALTER SEQUENCE admintools.group_members_id_seq OWNER TO admintools;

-- ── app: nextjs-web (Prisma Client) — full rw on v3 schemas,
--        read-only on labor data ─────────────────────────────────────
GRANT USAGE ON SCHEMA app TO app;
GRANT ALL ON ALL TABLES    IN SCHEMA app TO app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA app TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON TABLES TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON SEQUENCES TO app;
GRANT USAGE ON SCHEMA kot, directory TO app;
GRANT SELECT ON ALL TABLES IN SCHEMA kot, directory TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA kot GRANT SELECT ON TABLES TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA directory GRANT SELECT ON TABLES TO app;

-- ── kot_ro: Metabase / reporting (read-only) ─────────────────────────
GRANT USAGE ON SCHEMA kot, directory TO kot_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA kot, directory TO kot_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA kot GRANT SELECT ON TABLES TO kot_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA directory GRANT SELECT ON TABLES TO kot_ro;

-- ── studio_ro: Prisma Studio browser (read-only, EVERY schema) ────────
-- SELECT-only, so Studio can browse all data but edits fail at the DB.
-- Default privileges here are set by postgres (the migration grantor), so
-- future Prisma-created tables in the v3 schemas are covered automatically.
-- The app-owned schemas (admintools, directory) get FOR ROLE default privs
-- so tables those apps add later are also visible.
GRANT USAGE ON SCHEMA app, kot, directory, admintools TO studio_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA app, kot, directory, admintools TO studio_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA app, kot, directory GRANT SELECT ON TABLES TO studio_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE admintools IN SCHEMA admintools GRANT SELECT ON TABLES TO studio_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE ldap_sync IN SCHEMA directory GRANT SELECT ON TABLES TO studio_ro;
