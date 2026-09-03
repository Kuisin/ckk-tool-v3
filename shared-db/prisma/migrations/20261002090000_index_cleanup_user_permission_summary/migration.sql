-- 索引の整理 + 「ユーザー 1 行 = 全権限」のビュー。
--
-- ■ (1) 冗長な索引を落とす（6 本）
-- どれも**同じ表の unique / 複合索引の先頭列と一致する**単独索引。btree は
-- 先頭列だけの検索にも使えるので、二重に持っても読みは速くならず、書き込みの
-- たびに 1 本余分に更新するぶんだけ損をする（pg_index の indkey 前置き一致で
-- 機械的に検出）。
--
-- ⚠️ idx_scan = 0 は根拠にしていない。dev / main とも表が数十〜数百行で、
-- planner が seq scan を選ぶため**使われている索引まで 0 に見える**
-- （両環境で 113 本が 0 だった）。統計で落とすのはデータが育ってから。
DROP INDEX IF EXISTS app.order_lines_acceptance_year_month_acceptance_seq_idx;  -- ⊂ order_lines_acceptance_year_month_acceptance_seq_branch_key (unique)
DROP INDEX IF EXISTS app.material_inventory_material_id_idx;                   -- ⊂ material_inventory_bucket_key (unique)
DROP INDEX IF EXISTS app.product_inventory_product_id_idx;                     -- ⊂ product_inventory_bucket_key (unique)
DROP INDEX IF EXISTS app.product_process_routes_product_id_idx;                -- ⊂ product_process_routes_product_id_customer_bp_id_idx
DROP INDEX IF EXISTS app.share_grants_owner_type_owner_id_idx;                 -- ⊂ share_grants_owner_type_owner_id_subject_type_subject_id_le_key (unique)
DROP INDEX IF EXISTS app.portal_grants_portal_account_id_idx;                  -- ⊂ portal_grants_portal_account_id_kind_resource_type_resource_key (unique)

-- ■ (2) 承認者 → 依頼 の逆引き
-- approval_request_approvers の PK は (approval_request_id, user_id) で、
-- 「この人が承認者になっている依頼」（isApproverOf / 承認・予定の自分宛て）は
-- user_id 単独で引くのに索引が無かった。承認のたびに増える表なので足す。
CREATE INDEX IF NOT EXISTS approval_request_approvers_user_id_idx
  ON app.approval_request_approvers (user_id);

-- ■ (3) スキーマと DB のずれを閉じる（prisma migrate diff が空になるように）
-- 手書きのマイグレーション 2 本が、Prisma の @updatedAt 列に DB 既定値
-- （now() / CURRENT_TIMESTAMP）を付けていた。スキーマ側に既定値は無く、書き手は
-- Prisma だけ（updatedAt は Prisma が必ず入れる。生 SQL の INSERT は無い）ので
-- DB 側を落とす。users_disabled_by_fkey は ON UPDATE が無指定で、Prisma の既定
-- （ON UPDATE CASCADE）と食い違っていた — id は書き換えない列なので実害は無いが、
-- diff に出続けると本物の変更が埋もれる。
ALTER TABLE app.form_approval_steps ALTER COLUMN updated_at DROP DEFAULT;
ALTER TABLE app.user_view_settings  ALTER COLUMN updated_at DROP DEFAULT;
ALTER TABLE app.users DROP CONSTRAINT IF EXISTS users_disabled_by_fkey;
ALTER TABLE app.users
  ADD CONSTRAINT users_disabled_by_fkey
  FOREIGN KEY (disabled_by) REFERENCES app.users(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ■ (4) app.user_permission_summary — ユーザー 1 行に実効権限をまとめたビュー
--
-- app.user_permissions は **grant 1 件 = 1 行**（ロールを 2 つ持つ人は同じ
-- (code, action) が何行も並ぶ）。判定（authz-core decide()）にはそれが正しいが、
-- 「この人は結局なにを持っているのか」を一覧で読むには向かない。ここはその
-- 読み物 — 1 行 = 1 ユーザーで、判定には使わない（判定は従来どおり
-- user_permissions の全行の和集合）。
--
--   roles            有効なロール割当（is_active かつ失効前）の rolename。
--                    users.is_active は見ない — 利用停止中でも「何が割り当て
--                    られているか」は読めてよい（SY01 の割当タブと同じ）。
--   permission_codes 実効権限のコード（重複なし・昇順）。
--   grants           'code:ACTION@SCOPE' の配列。PLANT/REGION で対象コードを
--                    列挙している grant は 'quote:READ@PLANT[TOKYO,OSAKA]'。
--                    '*'（ワイルドカード）は省く。重複なし・昇順。
--   permissions      { code: { ACTION: [ { scope, scope_values }, … ] } }。
--                    同じ (code, action) に複数ロールから別スコープが来る場合は
--                    配列に全部残す（いちばん広い 1 行に畳むのは表示側 —
--                    authz-core highestScopeRows）。
--   grant_count      grants の要素数。
--   is_superuser     system:ADMIN を持つか。
--
-- 実効権限は user_permissions 経由なので、利用停止中のユーザーは
-- permission_codes / grants / permissions が空になる（roles だけ残る）。
-- 全ユーザーを LEFT JOIN で出すので、ロール未割当の人も 1 行になる。
CREATE VIEW app.user_permission_summary AS
WITH scoped AS (
  -- (user, code, action, scope, scope_values) の重複を先に潰す
  SELECT DISTINCT
    up.user_id,
    up.permission_code,
    up.action,
    up.scope,
    coalesce(up.scope_values, ARRAY['*']::text[]) AS scope_values
  FROM app.user_permissions up
),
by_action AS (
  SELECT
    user_id, permission_code, action,
    jsonb_agg(
      jsonb_build_object('scope', scope::text, 'scope_values', to_jsonb(scope_values))
      ORDER BY scope, scope_values
    ) AS scopes
  FROM scoped
  GROUP BY user_id, permission_code, action
),
by_code AS (
  SELECT
    user_id, permission_code,
    jsonb_object_agg(action::text, scopes) AS actions
  FROM by_action
  GROUP BY user_id, permission_code
),
per_user AS (
  SELECT
    s.user_id,
    array_agg(DISTINCT s.permission_code ORDER BY s.permission_code) AS permission_codes,
    array_agg(
      DISTINCT s.permission_code || ':' || s.action::text || '@' || s.scope::text
        || CASE WHEN s.scope_values = ARRAY['*']::text[] THEN ''
                ELSE '[' || array_to_string(s.scope_values, ',') || ']' END
      ORDER BY s.permission_code || ':' || s.action::text || '@' || s.scope::text
        || CASE WHEN s.scope_values = ARRAY['*']::text[] THEN ''
                ELSE '[' || array_to_string(s.scope_values, ',') || ']' END
    ) AS grants,
    bool_or(s.permission_code = 'system' AND s.action = 'ADMIN') AS is_superuser
  FROM scoped s
  GROUP BY s.user_id
),
codes AS (
  SELECT user_id, jsonb_object_agg(permission_code, actions) AS permissions
  FROM by_code
  GROUP BY user_id
),
role_names AS (
  SELECT
    urr.user_id,
    array_agg(r.rolename ORDER BY r.rolename) AS roles
  FROM app.user_role_relation urr
  JOIN app.roles r ON r.id = urr.role_id
  WHERE urr.is_active
    AND (urr.deactivate_at IS NULL OR urr.deactivate_at > now())
  GROUP BY urr.user_id
)
SELECT
  u.id                                            AS user_id,
  u.username,
  u.display_name,
  u.is_active,
  coalesce(rn.roles, ARRAY[]::text[])             AS roles,
  coalesce(pu.permission_codes, ARRAY[]::text[])  AS permission_codes,
  coalesce(pu.grants, ARRAY[]::text[])            AS grants,
  coalesce(c.permissions, '{}'::jsonb)            AS permissions,
  coalesce(cardinality(pu.grants), 0)             AS grant_count,
  coalesce(pu.is_superuser, false)                AS is_superuser
FROM app.users u
LEFT JOIN role_names rn ON rn.user_id = u.id
LEFT JOIN per_user  pu ON pu.user_id = u.id
LEFT JOIN codes     c  ON c.user_id  = u.id;

COMMENT ON VIEW app.user_permission_summary IS
  'ユーザー 1 行 = 実効権限のまとめ（表示・点検用）。判定は app.user_permissions の全行を authz-core decide() で解く — このビューは判定に使わない。';
