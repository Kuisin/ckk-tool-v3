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
ALTER ROLE metabase_ro IN DATABASE ckk SET search_path = app, analytics;
ALTER ROLE studio_ro  IN DATABASE ckk SET search_path = app, analytics, kot, directory, admintools;

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

-- ── metabase_ro: Metabase business DB (read-only, app schema only) ───
-- The 「CKK 業務」 Metabase data source connects as this role. SELECT-only on
-- the v3 business schema `app`; deliberately NOT granted kot/directory
-- (those stay on the separate 労務 data source via kot_ro). Postgres is the
-- grantor of Prisma migrations, so default privileges cover future app tables.
GRANT USAGE ON SCHEMA app TO metabase_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO metabase_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT ON TABLES TO metabase_ro;

-- ── metabase_ro data masking (must come AFTER the blanket GRANT above) ─
-- BI には不要で、漏れると危険な認証・セッション・端末鍵・PIN・プッシュ秘密を
-- metabase_ro から隠す。Postgres は権限の無いテーブル/列を information_schema
-- に見せないので、これを適用して db 5 を再同期すると Metabase から自動的に
-- 消える（列を追加したらこのリストを見直す — 明示列挙のため新列は既定で不可視）。
--
-- (1) まるごと不要なセッション/秘密テーブル — テーブルごと SELECT を剥奪
REVOKE SELECT ON app.kiosk_sessions      FROM metabase_ro;  -- 稼働中セッション
REVOKE SELECT ON app.kiosk_link_requests FROM metabase_ro;  -- 端末リンクコード
REVOKE SELECT ON app.push_subscriptions  FROM metabase_ro;  -- Web Push 秘密鍵

-- (2) 一部だけ秘密の表 — テーブル SELECT を剥奪し、安全な列だけ列単位で GRANT
--     （Postgres ではテーブル SELECT があると列単位 REVOKE が効かないため、
--      一旦落として許可列を足し直す）。
REVOKE SELECT ON app.users FROM metabase_ro;
GRANT SELECT (id, "group", employee_id, username, display_name, email,
              is_active, last_login_at, created_at, updated_at, locale,
              avatar_file_id, avatar_thumb_file_id, date_format, time_format,
              time_zone)
  ON app.users TO metabase_ro;  -- 隠す: password_hash

REVOKE SELECT ON app.kiosk_cards FROM metabase_ro;
GRANT SELECT (id, user_id, status, last_used_at, use_count, assigned_at,
              assigned_by, revoked_at, revoked_by, created_at, updated_at,
              valid_from, valid_until, max_active_sessions)
  ON app.kiosk_cards TO metabase_ro;  -- 隠す: pin_hash, pin_set_at, pin_failed_attempts, pin_locked_until, pin_last_verified_at

REVOKE SELECT ON app.kiosk_devices FROM metabase_ro;
GRANT SELECT (id, name, location, plant_id, floor_map_id, map_x, map_y, status,
              device_token_expires_at, user_agent, activated_by, activated_at,
              last_activity_at, created_at, updated_at, linked_at, settings_code)
  ON app.kiosk_devices TO metabase_ro;  -- 隠す: device_token_hash, device_public_key, fingerprint, last_ip_address

-- ── analytics: name-resolved reporting views for Metabase + AI/MCP ────
-- Views defined in shared-db/sql/analytics-views.sql (run that FIRST — the schema
-- must exist). They are WITH (security_invoker=true), so metabase_ro's own
-- privileges (incl. the masking above) are enforced *through* the views; a view
-- that touched a masked column would just fail for metabase_ro. USAGE + SELECT
-- for the two read-only reporting roles; default privileges (grantor postgres,
-- who owns the views) cover views added later. Not a Prisma-managed schema.
GRANT USAGE ON SCHEMA analytics TO metabase_ro, studio_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO metabase_ro, studio_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT SELECT ON TABLES TO metabase_ro, studio_ro;

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
