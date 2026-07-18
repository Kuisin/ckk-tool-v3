-- roles-seed.sql — 本番運用ロール一式（権限マトリクス付き・冪等）。
--
-- 適用: cd shared-db && pnpm remote sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/roles-seed.sql'
--
-- 前提: rbac-seed.sql（permissions 16 コード + admin/staff ロール）適用済み。
-- 本番ではここで定義するロールを実ユーザーへ割り当てる（user_role_relation）。
-- 承認（APPROVE）は権限に加えて承認グループ所属（approval_group_members）が
-- 実ゲートである点に注意 — 権限はコード×アクションの門番のみ。
--
-- マトリクス（R=READ C=CREATE U=UPDATE D=DELETE E=EXPORT A=APPROVE）:
--   manager    : 全業務 R+E+A（承認者・閲覧横断）
--   sales (営業メンバー)  : 見積(quote)/価格表(price_list) C·R·U（自分=OWN）+ マスタ R
--   purchasing : 購買依頼・発注/入荷/外注 RCUDE(+発注 A)、在庫 R、他 R
--   production : 注文請書・指示書 RCUDEA、在庫 RCUE、外注 RU、他 R
--   quality    : 指示書（検査記録・検査承認） RUA、他 R
--   shipping   : 出荷書/納品書 RCUDE、在庫 RU、他 R
--   accounting : 請求書/締日 RCUDE、販売・出荷 R、他 R
--   viewer     : 全業務 R
--   sales_assistant (営業補佐) : 見積/価格表 R（全件=ALL）+ マスタ R。作成/編集/承認なし
--   sales_manager (営業部長)   : 見積/価格表 R·C·U·D·E·A（全件=ALL）+ マスタ/承認 R
--   <division>_manager（×5・他部門長） : 自部門コード RCUDEA + 全業務 R
--   （member = 既存の部門ロール。manager = 部門フル + 横断閲覧 + 承認）

BEGIN;

-- ─── ロール ──────────────────────────────────────────────────────────────────
INSERT INTO app.roles (is_system, rolename, display_name, description) VALUES
  (true, 'manager',    '{"ja":"管理職（承認者）","en":"Manager"}',      '{"ja":"全業務の閲覧・承認・エクスポート","en":""}'),
  (true, 'sales',      '{"ja":"営業","en":"Sales"}',                    '{"ja":"見積・価格表・受注請書・設計依頼","en":""}'),
  (true, 'purchasing', '{"ja":"購買","en":"Purchasing"}',               '{"ja":"購買依頼・素材発注・入荷・外注","en":""}'),
  (true, 'production', '{"ja":"製造・生産管理","en":"Production"}',     '{"ja":"注文請書・指示書・工程実行・在庫","en":""}'),
  (true, 'quality',    '{"ja":"品質・検査","en":"Quality"}',            '{"ja":"検査記録・検査承認","en":""}'),
  (true, 'shipping',   '{"ja":"出荷","en":"Shipping"}',                 '{"ja":"出荷書・納品書","en":""}'),
  (true, 'accounting', '{"ja":"経理","en":"Accounting"}',               '{"ja":"請求書・締日処理・会計連携","en":""}'),
  (true, 'viewer',     '{"ja":"閲覧","en":"Viewer"}',                   '{"ja":"全業務の閲覧のみ","en":""}'),
  (true, 'sales_assistant', '{"ja":"営業補佐","en":"Sales assistant"}',  '{"ja":"見積・受注・注文請書の作成/編集（承認不可）","en":""}'),
  (true, 'sales_manager',      '{"ja":"営業部長","en":"Sales manager"}',      '{"ja":"営業部門フル + 全業務閲覧","en":""}'),
  (true, 'purchasing_manager', '{"ja":"購買部長","en":"Purchasing manager"}', '{"ja":"購買部門フル + 全業務閲覧","en":""}'),
  (true, 'production_manager', '{"ja":"製造部長","en":"Production manager"}', '{"ja":"製造部門フル + 全業務閲覧","en":""}'),
  (true, 'quality_manager',    '{"ja":"品質部長","en":"Quality manager"}',    '{"ja":"品質部門フル + 全業務閲覧","en":""}'),
  (true, 'shipping_manager',   '{"ja":"出荷部長","en":"Shipping manager"}',   '{"ja":"出荷部門フル + 全業務閲覧","en":""}'),
  (true, 'accounting_manager', '{"ja":"経理部長","en":"Accounting manager"}', '{"ja":"経理部門フル + 全業務閲覧","en":""}')
ON CONFLICT (rolename) DO NOTHING;

-- ─── 権限グラント ────────────────────────────────────────────────────────────

-- manager: 全業務コード（system 以外）に R + E + A
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN app.permissions p
CROSS JOIN (VALUES ('READ'),('EXPORT'),('APPROVE')) AS a(action)
WHERE r.rolename = 'manager' AND p.code <> 'system'
ON CONFLICT DO NOTHING;

-- viewer: 全業務コード（system 以外）に R
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r CROSS JOIN app.permissions p
WHERE r.rolename = 'viewer' AND p.code <> 'system'
ON CONFLICT DO NOTHING;

-- sales（営業メンバー）: 自分の 試算/見積(quote)・価格表(price_list) を作成・閲覧・
--   編集（scope OWN）。参照マスタは全件 READ。他者データ・削除・承認・エクスポートは不可。
--   ※ 本番公開アプリ（試算/価格表/見積書）に合わせて quote+price_list に限定。
--   既存の権限を作り直すため DELETE してから INSERT（冪等・スコープ変更も反映）。
DELETE FROM app.role_permission_relation
WHERE role_id = (SELECT id FROM app.roles WHERE rolename = 'sales');
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, g.code, g.action::app."ACTION", g.scope::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES
  ('quote','READ','OWN'),('quote','CREATE','OWN'),('quote','UPDATE','OWN'),
  ('price_list','READ','OWN'),('price_list','CREATE','OWN'),('price_list','UPDATE','OWN'),
  ('master','READ','ALL')
) AS g(code, action, scope)
WHERE r.rolename = 'sales'
ON CONFLICT DO NOTHING;

-- purchasing
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, g.code, g.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES
  ('purchase_order','READ'),('purchase_order','CREATE'),('purchase_order','UPDATE'),('purchase_order','DELETE'),('purchase_order','EXPORT'),('purchase_order','APPROVE'),
  ('material_receipt','READ'),('material_receipt','CREATE'),('material_receipt','UPDATE'),('material_receipt','DELETE'),('material_receipt','EXPORT'),
  ('outsource_order','READ'),('outsource_order','CREATE'),('outsource_order','UPDATE'),('outsource_order','DELETE'),
  ('inventory','READ'),('work_order','READ'),('master','READ'),('approve','READ')
) AS g(code, action)
WHERE r.rolename = 'purchasing'
ON CONFLICT DO NOTHING;

-- production
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, g.code, g.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES
  ('work_order','READ'),('work_order','CREATE'),('work_order','UPDATE'),('work_order','DELETE'),('work_order','EXPORT'),('work_order','APPROVE'),
  ('inventory','READ'),('inventory','CREATE'),('inventory','UPDATE'),('inventory','EXPORT'),
  ('outsource_order','READ'),('outsource_order','UPDATE'),
  ('material_receipt','READ'),('purchase_order','READ'),
  ('order_acceptance','READ'),('shipping_order','READ'),
  ('master','READ'),('approve','READ')
) AS g(code, action)
WHERE r.rolename = 'production'
ON CONFLICT DO NOTHING;

-- quality（検査記録・検査承認は work_order の UPDATE/APPROVE）
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, g.code, g.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES
  ('work_order','READ'),('work_order','UPDATE'),('work_order','APPROVE'),
  ('inventory','READ'),('master','READ'),('approve','READ')
) AS g(code, action)
WHERE r.rolename = 'quality'
ON CONFLICT DO NOTHING;

-- shipping
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, g.code, g.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES
  ('shipping_order','READ'),('shipping_order','CREATE'),('shipping_order','UPDATE'),('shipping_order','DELETE'),('shipping_order','EXPORT'),
  ('delivery_note','READ'),('delivery_note','CREATE'),('delivery_note','UPDATE'),('delivery_note','DELETE'),('delivery_note','EXPORT'),
  ('inventory','READ'),('inventory','UPDATE'),
  ('work_order','READ'),('order_acceptance','READ'),('master','READ')
) AS g(code, action)
WHERE r.rolename = 'shipping'
ON CONFLICT DO NOTHING;

-- accounting
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, g.code, g.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES
  ('invoice','READ'),('invoice','CREATE'),('invoice','UPDATE'),('invoice','DELETE'),('invoice','EXPORT'),
  ('billing_closing','READ'),('billing_closing','CREATE'),('billing_closing','UPDATE'),('billing_closing','EXPORT'),
  ('shipping_order','READ'),('delivery_note','READ'),
  ('quote','READ'),('order_acceptance','READ'),('price_list','READ'),('master','READ')
) AS g(code, action)
WHERE r.rolename = 'accounting'
ON CONFLICT DO NOTHING;

-- sales_assistant（営業補佐）: 営業データ（試算/見積・価格表）を全件 READ のみ。
--   参照マスタも READ。作成・編集・削除・承認は一切不可。
DELETE FROM app.role_permission_relation
WHERE role_id = (SELECT id FROM app.roles WHERE rolename = 'sales_assistant');
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, g.code, 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('quote'),('price_list'),('master')) AS g(code)
WHERE r.rolename = 'sales_assistant'
ON CONFLICT DO NOTHING;

-- ─── 部門長ロール（member = 既存部門ロール / manager = 部門フル + 横断閲覧） ───

-- sales_manager（営業部長）: 営業データ（試算/見積・価格表）を全件フル
--   （R・C・U・D・E・APPROVE, scope ALL — 他者データの閲覧含む） + 参照マスタ READ +
--   承認閲覧。※ 本番公開アプリに合わせ quote+price_list に限定。
DELETE FROM app.role_permission_relation
WHERE role_id = (SELECT id FROM app.roles WHERE rolename = 'sales_manager');
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('quote'),('price_list')) AS c(code)
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE'),('DELETE'),('EXPORT'),('APPROVE')) AS a(action)
WHERE r.rolename = 'sales_manager'
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, g.code, 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r CROSS JOIN (VALUES ('master'),('approve')) AS g(code)
WHERE r.rolename = 'sales_manager'
ON CONFLICT DO NOTHING;

-- purchasing_manager: 自部門フル（RCUDEA） + 全業務 READ
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('purchase_order'),('material_receipt'),('outsource_order')) AS c(code)
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE'),('DELETE'),('EXPORT'),('APPROVE')) AS a(action)
WHERE r.rolename = 'purchasing_manager'
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r CROSS JOIN app.permissions p
WHERE r.rolename = 'purchasing_manager' AND p.code <> 'system'
ON CONFLICT DO NOTHING;

-- production_manager: 自部門フル（RCUDEA） + 全業務 READ
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('work_order'),('inventory'),('outsource_order')) AS c(code)
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE'),('DELETE'),('EXPORT'),('APPROVE')) AS a(action)
WHERE r.rolename = 'production_manager'
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r CROSS JOIN app.permissions p
WHERE r.rolename = 'production_manager' AND p.code <> 'system'
ON CONFLICT DO NOTHING;

-- quality_manager: 自部門フル（RCUDEA） + 全業務 READ
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('work_order')) AS c(code)
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE'),('DELETE'),('EXPORT'),('APPROVE')) AS a(action)
WHERE r.rolename = 'quality_manager'
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r CROSS JOIN app.permissions p
WHERE r.rolename = 'quality_manager' AND p.code <> 'system'
ON CONFLICT DO NOTHING;

-- shipping_manager: 自部門フル（RCUDEA） + 全業務 READ
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('shipping_order'),('delivery_note'),('inventory')) AS c(code)
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE'),('DELETE'),('EXPORT'),('APPROVE')) AS a(action)
WHERE r.rolename = 'shipping_manager'
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r CROSS JOIN app.permissions p
WHERE r.rolename = 'shipping_manager' AND p.code <> 'system'
ON CONFLICT DO NOTHING;

-- accounting_manager: 自部門フル（RCUDEA） + 全業務 READ
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('invoice'),('billing_closing')) AS c(code)
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE'),('DELETE'),('EXPORT'),('APPROVE')) AS a(action)
WHERE r.rolename = 'accounting_manager'
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r CROSS JOIN app.permissions p
WHERE r.rolename = 'accounting_manager' AND p.code <> 'system'
ON CONFLICT DO NOTHING;

COMMIT;
