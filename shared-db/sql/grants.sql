-- Role grants + search_path for the CKK shared DB.
--
-- 適用は自動 — Coolify の db-migrate-dev / db-migrate-main が **毎デプロイ**
-- 流す（migration ではなく毎回流すのは、後から増えたテーブルにも権限を
-- 行き渡らせる必要があるため）。手で流すときは postgres で:
--   docker exec -i <db> psql -U postgres -d ckk < grants.sql
--
-- 冪等。既定権限（ALTER DEFAULT PRIVILEGES）が今後の migration で増える
-- テーブルもカバーする（migration は postgres で走るので付与者は常に postgres）。

-- ── 前提の作成 ───────────────────────────────────────────────────────
-- まっさらな DB では他アプリのスキーマもロールもまだ無い。ここで先に作って
-- おくことで、このファイルが「新規 DB でもそのまま通る」状態を保つ。
--   kot        — KOT 勤怠取込が自分でテーブルを作る
--   admintools — admintools が自分でテーブルを作る
--   analytics  — analytics-views.sql が使う
CREATE SCHEMA IF NOT EXISTS kot;
CREATE SCHEMA IF NOT EXISTS admintools;
CREATE SCHEMA IF NOT EXISTS analytics;

-- ロールは通常 init/01-roles.sh（初回起動時）が env のパスワード付きで作る。
-- 無い場合（撮影用の使い捨て DB など）だけ、権限の受け皿として NOLOGIN で
-- 用意する — 既にあるロールには一切触れない。
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['kot','ldap_sync','admintools','app','kot_ro',
                           'metabase_ro','fx_rates','studio_ro','backup']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
      RAISE NOTICE 'created placeholder role % (NOLOGIN)', r;
    END IF;
  END LOOP;
END
$$;

-- ── search_path per role ─────────────────────────────────────────────
-- Apps use unqualified table names; the first schema in the path is where
-- their CREATE TABLE IF NOT EXISTS statements resolve (must be the schema
-- that already owns their tables).
ALTER ROLE kot        IN DATABASE ckk SET search_path = kot, directory;
ALTER ROLE ldap_sync  IN DATABASE ckk SET search_path = directory, kot;
ALTER ROLE admintools IN DATABASE ckk SET search_path = admintools;
ALTER ROLE kot_ro     IN DATABASE ckk SET search_path = kot, directory;
ALTER ROLE metabase_ro IN DATABASE ckk SET search_path = app, analytics;
ALTER ROLE fx_rates   IN DATABASE ckk SET search_path = app;
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
-- kot.employees は KOT 取込アプリが作る。新規 DB ではまだ無いので条件付き
-- （その後 kot-import が起動すれば、次のデプロイでこの GRANT が効く）。
DO $$
BEGIN
  IF to_regclass('kot.employees') IS NOT NULL THEN
    GRANT INSERT, UPDATE ON kot.employees TO ldap_sync;
  END IF;
END
$$;
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
-- admintools のテーブルはアプリ自身が作る。新規 DB ではまだ無いので条件付き。
DO $$
DECLARE obj text;
BEGIN
  FOREACH obj IN ARRAY ARRAY['admintools.mail_accounts', 'admintools.group_members']
  LOOP
    IF to_regclass(obj) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %s OWNER TO admintools', obj);
    END IF;
  END LOOP;
  FOREACH obj IN ARRAY ARRAY['admintools.mail_accounts_id_seq', 'admintools.group_members_id_seq']
  LOOP
    IF to_regclass(obj) IS NOT NULL THEN
      EXECUTE format('ALTER SEQUENCE %s OWNER TO admintools', obj);
    END IF;
  END LOOP;
END
$$;

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
-- 認証イベントと端末台帳。IP・端末シグネチャ・相関ハッシュ・ハードウェア構成を
-- 含み、従業員監視に隣接する。閲覧は SY0D（system 権限）に閉じるのが設計なので、
-- BI からはテーブルごと外す。
REVOKE SELECT ON app.login_attempts      FROM metabase_ro;  -- 認証イベント（個人データ）
REVOKE SELECT ON app.user_devices        FROM metabase_ro;  -- 端末台帳（個人データ）
-- 特権アクセスの申請と決裁。「誰がどの秘密を見たがったか」「誰が誰を止めよう
-- としたか」が理由つきで並ぶ表で、BI で集計する対象ではない。閲覧は SY0G と
-- 監査ログに閉じる。
REVOKE SELECT ON app.privileged_access_requests            FROM metabase_ro;
REVOKE SELECT ON app.privileged_access_request_operations  FROM metabase_ro;
REVOKE SELECT ON app.user_change_requests                  FROM metabase_ro;

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
-- ownership は「社用/私用」の集計に使えて無害なので許可列に入れる。判定根拠
-- （ownership_source）と端末プロファイルは調査用なので出さない。
GRANT SELECT (id, name, location, plant_id, floor_map_id, map_x, map_y, status,
              device_token_expires_at, user_agent, activated_by, activated_at,
              last_activity_at, created_at, updated_at, linked_at, settings_code,
              ownership)
  ON app.kiosk_devices TO metabase_ro;  -- 隠す: device_token_hash, device_public_key, fingerprint, last_ip_address, linked_ip_address, ownership_source, device_profile*

-- 管理ディスプレイ（デジタルサイネージ）。リンクコードは据付中に有効な
-- 生の秘密なので表ごと落とす。端末側は「どこに何台あって、いつまで生きていたか」
-- が BI で意味を持つので列単位で許す。
REVOKE SELECT ON app.display_link_requests FROM metabase_ro;  -- リンクコード（有効中）
REVOKE SELECT ON app.display_devices FROM metabase_ro;
GRANT SELECT (id, name, location, plant_id, display_profile_id, status,
              device_token_expires_at, last_seen_at, app_version,
              linked_at, activated_by, activated_at, created_at, updated_at)
  ON app.display_devices TO metabase_ro;  -- 隠す: device_token_hash, last_ip_address, user_agent

-- display_profiles は「何を映しているか」の一覧で、秘密を持たない…と言い切れない:
-- content_config には METABASE の locked パラメータや URL 種別の宛先が入る。
-- ただしどちらも社内の設定値で、閲覧できて困るものではないため制限しない。

-- 取引先ポータル（社外向け）。生きた資格情報とその使われ方が並ぶので、
-- 生の秘密を持つ表はまるごと外す。閲覧は SY0H に閉じる。
REVOKE SELECT ON app.portal_login_challenges FROM metabase_ro;  -- OTP のハッシュ（有効中）
REVOKE SELECT ON app.portal_backup_codes     FROM metabase_ro;  -- バックアップコードのハッシュ
REVOKE SELECT ON app.portal_sessions         FROM metabase_ro;  -- 稼働中セッション
REVOKE SELECT ON app.portal_rate_limits      FROM metabase_ro;  -- 相関キー（アドレス由来の HMAC）
REVOKE SELECT ON app.portal_document_links   FROM metabase_ro;  -- トークンハッシュ + 束縛アドレス
-- 社外の個人が「いつ何を見たか」と送信元 IP。login_attempts と同じ扱い。
REVOKE SELECT ON app.portal_access_logs      FROM metabase_ro;

-- portal_grants は「どの取引先に何を見せているか」で、BI で見て意味がある
-- （共有範囲の棚卸し）。秘密を持たないので列の制限はしない。

-- ポータルのアカウントは、取引先ごとの利用状況を数えられると有用なので
-- 列単位で許す。**メールアドレスと相関キーは出さない** — 社外の個人データで、
-- 表示は SY0H の権限つき画面（マスク + 監査記録つき）に閉じる設計のため。
REVOKE SELECT ON app.portal_accounts FROM metabase_ro;
GRANT SELECT (id, bp_id, display_name, locale, is_active, disabled_at,
              last_login_at, created_at, updated_at)
  ON app.portal_accounts TO metabase_ro;  -- 隠す: email, email_ref, bp_contact_id, disabled_reason, disabled_by, created_by

-- ── fx_rates: 為替レート日次更新（shared-db スタックの fx-rates コンテナ） ──
-- app.currencies の rate_per_100_jpy / updated_at だけを UPDATE できる最小権限。
-- 通貨の追加・削除・名称変更はできない（それはマスタ管理の仕事）。
GRANT USAGE ON SCHEMA app TO fx_rates;
GRANT SELECT ON app.currencies TO fx_rates;
GRANT UPDATE (rate_per_100_jpy, updated_at) ON app.currencies TO fx_rates;

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
