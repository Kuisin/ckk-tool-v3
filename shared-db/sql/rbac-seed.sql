-- rbac-seed.sql — RBAC 初期データ（監査 P0-1 の enforcement 前提データ）。
-- 冪等（ON CONFLICT）。適用:
--   cd shared-db && pnpm remote sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/rbac-seed.sql'
--
-- 設計:
--   permissions = app-list.ts の requiredPermission 全コード + system
--   roles: admin(全コード ADMIN + system ADMIN) / staff(業務コードの実務アクション)
--   demo1 → admin、demo2〜5 → staff

BEGIN;

-- ─── permissions ─────────────────────────────────────────────────────────────
INSERT INTO app.permissions (code, display_name, description) VALUES
  ('price_list',      '{"ja":"価格表","en":"Price list"}',            '{"ja":"","en":""}'),
  ('quote',           '{"ja":"見積書","en":"Quote"}',                 '{"ja":"","en":""}'),
  ('order_acceptance','{"ja":"受注請書","en":"Order acceptance"}',    '{"ja":"","en":""}'),
  ('design_request',  '{"ja":"設計依頼","en":"Design request"}',      '{"ja":"","en":""}'),
  ('material_receipt','{"ja":"素材入荷","en":"Material receipt"}',    '{"ja":"","en":""}'),
  ('outsource_order', '{"ja":"外注依頼","en":"Outsource order"}',     '{"ja":"","en":""}'),
  ('purchase_order',  '{"ja":"素材発注・購買依頼","en":"Purchasing"}','{"ja":"","en":""}'),
  ('work_order',      '{"ja":"注文請書・指示書","en":"Work order"}',  '{"ja":"","en":""}'),
  ('approve',         '{"ja":"承認管理","en":"Approvals"}',           '{"ja":"","en":""}'),
  ('inventory',       '{"ja":"在庫","en":"Inventory"}',               '{"ja":"","en":""}'),
  ('shipping_order',  '{"ja":"出荷書","en":"Shipping order"}',        '{"ja":"","en":""}'),
  ('delivery_note',   '{"ja":"納品書","en":"Delivery note"}',         '{"ja":"","en":""}'),
  ('invoice',         '{"ja":"請求書","en":"Invoice"}',               '{"ja":"","en":""}'),
  ('billing_closing', '{"ja":"締日処理","en":"Billing closing"}',     '{"ja":"","en":""}'),
  ('master',          '{"ja":"マスタ管理","en":"Master data"}',       '{"ja":"","en":""}'),
  ('system',          '{"ja":"システム管理","en":"System admin"}',    '{"ja":"アプリ設定・ファイル管理・操作履歴","en":""}')
ON CONFLICT (code) DO NOTHING;

-- ─── roles ───────────────────────────────────────────────────────────────────
INSERT INTO app.roles (is_system, rolename, display_name, description) VALUES
  (true,  'admin', '{"ja":"管理者","en":"Administrator"}', '{"ja":"全権限","en":""}'),
  (true,  'staff', '{"ja":"一般","en":"Staff"}',           '{"ja":"業務全般（システム管理を除く）","en":""}')
ON CONFLICT DO NOTHING;

-- rolename に unique が無い環境でも重複しないよう存在チェックで補完
-- （初回 INSERT が入っていれば no-op）

-- ─── role_permission_relation ───────────────────────────────────────────────
-- admin: 全コード ADMIN（ADMIN は checkPermission 側で全アクションを内包）
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, 'ADMIN'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r CROSS JOIN app.permissions p
WHERE r.rolename = 'admin'
ON CONFLICT DO NOTHING;

-- staff: system 以外の業務コードに実務アクション（APPROVE は承認グループ所属が実ゲート）
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN app.permissions p
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE'),('DELETE'),('EXPORT'),('APPROVE')) AS a(action)
WHERE r.rolename = 'staff' AND p.code <> 'system'
ON CONFLICT DO NOTHING;

-- ─── demo ユーザーへのロール割当 ─────────────────────────────────────────────
INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now()
FROM app.users u JOIN app.roles r ON r.rolename = 'admin'
WHERE u.username = 'demo1'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now()
FROM app.users u JOIN app.roles r ON r.rolename = 'staff'
WHERE u.username IN ('demo2','demo3','demo4','demo5')
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

COMMIT;
