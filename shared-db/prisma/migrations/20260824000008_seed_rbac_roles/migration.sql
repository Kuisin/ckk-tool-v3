-- RBAC の初期データ — 権限コード 18 種 + admin/staff + 業務ロール 15 種。
--
-- `user_permissions` ビューはこれらを集約するので、空だと誰も何もできない。
-- 冪等（ON CONFLICT）だが migration なので適用は 1 回。
-- デモユーザー（demo1〜5）へのロール割当は含めない — それは撮影用 DB だけの
-- 話なので sql/rbac-seed.sql 側に残してある。

-- ─── permissions ─────────────────────────────────────────────────────────────
INSERT INTO app.permissions (code, display_name, description) VALUES
  ('price_list',      '{"ja":"価格表","en":"Price list"}',            '{"ja":"","en":""}'),
  ('quote',           '{"ja":"見積書","en":"Quote"}',                 '{"ja":"","en":""}'),
  ('order_acceptance','{"ja":"注文請書・注文明細","en":"Order acceptance"}', '{"ja":"","en":""}'),
  ('design_request',  '{"ja":"設計依頼","en":"Design request"}',      '{"ja":"","en":""}'),
  ('material_receipt','{"ja":"素材入荷","en":"Material receipt"}',    '{"ja":"","en":""}'),
  ('outsource_order', '{"ja":"外注依頼","en":"Outsource order"}',     '{"ja":"","en":""}'),
  ('purchase_order',  '{"ja":"素材発注・購買依頼","en":"Purchasing"}','{"ja":"","en":""}'),
  ('work_order',      '{"ja":"指示書","en":"Work order"}',        '{"ja":"","en":""}'),
  ('approve',         '{"ja":"承認管理","en":"Approvals"}',           '{"ja":"","en":""}'),
  ('inventory',       '{"ja":"在庫","en":"Inventory"}',               '{"ja":"","en":""}'),
  ('delivery_order',  '{"ja":"出荷書","en":"Delivery order"}',        '{"ja":"","en":""}'),
  ('delivery_note',   '{"ja":"納品書","en":"Delivery note"}',         '{"ja":"","en":""}'),
  ('invoice',         '{"ja":"請求書","en":"Invoice"}',               '{"ja":"","en":""}'),
  ('billing_closing', '{"ja":"締日処理","en":"Billing closing"}',     '{"ja":"","en":""}'),
  ('master',          '{"ja":"マスタ管理","en":"Master data"}',       '{"ja":"","en":""}'),
  ('system',          '{"ja":"システム管理","en":"System admin"}',    '{"ja":"アプリ設定・ファイル管理・操作履歴","en":""}'),
  ('kiosk',           '{"ja":"キオスク管理","en":"Kiosk admin"}',     '{"ja":"QRカード・共有端末の管理","en":""}'),
  ('internal_docs',   '{"ja":"社内ドキュメント","en":"Internal docs"}','{"ja":"端末セットアップ等の社内向け手順書（公開マニュアルとは別権限）","en":""}')
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

-- 承認は権限アクションでは管理しない — APPROVE グラントは全ロールから全廃。
-- 承認できる人は承認設定（MS0B）の承認グループ所属だけが決め、RBAC 側の要件は
-- その書類の READ / UPDATE（閲覧または編集 — lib/authz.ts checkApprovalDocAccess）。
-- ACTION enum の 'APPROVE' 値自体は互換のため残す（行を作らないだけ）。
DELETE FROM app.role_permission_relation WHERE action = 'APPROVE';

-- staff: system / kiosk 以外の業務コードに実務アクション
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN app.permissions p
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE'),('DELETE'),('EXPORT')) AS a(action)
WHERE r.rolename = 'staff' AND p.code NOT IN ('system', 'kiosk', 'internal_docs')
ON CONFLICT DO NOTHING;

-- ─── ロール ──────────────────────────────────────────────────────────────────
INSERT INTO app.roles (is_system, rolename, display_name, description) VALUES
  (true, 'manager',    '{"ja":"管理職（承認者）","en":"Manager"}',      '{"ja":"全業務の閲覧・承認・エクスポート","en":""}'),
  (true, 'sales',      '{"ja":"営業","en":"Sales"}',                    '{"ja":"見積・価格表・受注請書・設計依頼（自分のデータ）","en":""}'),
  (true, 'purchasing', '{"ja":"購買","en":"Purchasing"}',               '{"ja":"購買依頼・素材発注・入荷・外注","en":""}'),
  (true, 'production', '{"ja":"製造・生産管理","en":"Production"}',     '{"ja":"受注明細・指示書・工程実行・在庫","en":""}'),
  (true, 'quality',    '{"ja":"品質・検査","en":"Quality"}',            '{"ja":"検査記録・検査承認","en":""}'),
  (true, 'shipping',   '{"ja":"出荷","en":"Shipping"}',                 '{"ja":"出荷書・納品書","en":""}'),
  (true, 'accounting', '{"ja":"経理","en":"Accounting"}',               '{"ja":"請求書・締日処理・会計連携","en":""}'),
  (true, 'viewer',     '{"ja":"閲覧","en":"Viewer"}',                   '{"ja":"全業務の閲覧のみ","en":""}'),
  (true, 'sales_assistant', '{"ja":"営業補佐","en":"Sales assistant"}',  '{"ja":"営業データの閲覧のみ（作成・編集・承認は不可）","en":""}'),
  (true, 'sales_manager',      '{"ja":"営業部長","en":"Sales manager"}',      '{"ja":"営業部門フル + 全業務閲覧","en":""}'),
  (true, 'purchasing_manager', '{"ja":"購買部長","en":"Purchasing manager"}', '{"ja":"購買部門フル + 全業務閲覧","en":""}'),
  (true, 'production_manager', '{"ja":"製造部長","en":"Production manager"}', '{"ja":"製造部門フル + 全業務閲覧","en":""}'),
  (true, 'quality_manager',    '{"ja":"品質部長","en":"Quality manager"}',    '{"ja":"品質部門フル + 全業務閲覧","en":""}'),
  (true, 'shipping_manager',   '{"ja":"出荷部長","en":"Shipping manager"}',   '{"ja":"出荷部門フル + 全業務閲覧","en":""}'),
  (true, 'accounting_manager', '{"ja":"経理部長","en":"Accounting manager"}', '{"ja":"経理部門フル + 全業務閲覧","en":""}')
-- 表示名・説明は毎回上書きする。DO NOTHING のままだと、アプリの用語が変わっても
-- （例: 注文請書 → 受注明細）DB のラベルが古いまま直せない。
ON CONFLICT (rolename) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description  = EXCLUDED.description;

-- ─── 権限グラント ────────────────────────────────────────────────────────────

-- 本ファイル所有の 15 ロールは毎回 DELETE → INSERT で作り直す（真の冪等）。
-- PK (role_id, action, permission_code) + ON CONFLICT DO NOTHING のままだと
-- scope / scope_values の変更が既存行に反映されない（サイレント no-op）ため。
DELETE FROM app.role_permission_relation
WHERE role_id IN (
  SELECT id FROM app.roles WHERE rolename IN (
    'manager','sales','purchasing','production','quality','shipping',
    'accounting','viewer','sales_assistant','sales_manager',
    'purchasing_manager','production_manager','quality_manager',
    'shipping_manager','accounting_manager'
  )
);

-- manager: 全業務コード（system 以外）に R + E（承認は MS0B のグループ所属で）
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN app.permissions p
CROSS JOIN (VALUES ('READ'),('EXPORT')) AS a(action)
WHERE r.rolename = 'manager' AND p.code NOT IN ('system', 'kiosk')
ON CONFLICT DO NOTHING;

-- viewer: 全業務コード（system 以外）に R
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r CROSS JOIN app.permissions p
WHERE r.rolename = 'viewer' AND p.code NOT IN ('system', 'kiosk')
ON CONFLICT DO NOTHING;

-- sales（営業メンバー）: 自分の 試算/見積(quote)・価格表(price_list)・受注請書
--   (order_acceptance)・設計依頼(design_request) を作成・閲覧・編集（scope OWN）。
--   参照マスタは全件 READ。他者データ・削除・承認・エクスポートは不可。
--
--   販売カテゴリの 6 アプリ（SA01 試算 / SA02 価格表 / SA03 見積書 / SA04 受注請書 /
--   SA05 受注明細 / SA06 設計依頼書）は 4 コードで賄われる。以前は本番公開分
--   （試算・価格表・見積書）に合わせて quote+price_list だけを配っていたが、
--   受注請書・受注明細・設計依頼書が実装済みの今は、営業ロールがそれらを
--   まったく使えない状態になっていた。**本番での見え方は feature_flags が
--   別に決める**ので、ここで配っても未公開アプリが本番に出ることはない。
--
--   既存の権限を作り直すため DELETE してから INSERT（冪等・スコープ変更も反映）。
DELETE FROM app.role_permission_relation
WHERE role_id = (SELECT id FROM app.roles WHERE rolename = 'sales');
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, a.action::app."ACTION", 'OWN'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('quote'),('price_list'),('order_acceptance'),('design_request')) AS c(code)
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE')) AS a(action)
WHERE r.rolename = 'sales'
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, 'master', 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r WHERE r.rolename = 'sales'
ON CONFLICT DO NOTHING;

-- purchasing
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, g.code, g.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES
  ('purchase_order','READ'),('purchase_order','CREATE'),('purchase_order','UPDATE'),('purchase_order','DELETE'),('purchase_order','EXPORT'),
  ('material_receipt','READ'),('material_receipt','CREATE'),('material_receipt','UPDATE'),('material_receipt','DELETE'),('material_receipt','EXPORT'),
  ('outsource_order','READ'),('outsource_order','CREATE'),('outsource_order','UPDATE'),('outsource_order','DELETE'),
  ('inventory','READ'),('work_order','READ'),('master','READ'),('approve','READ')
) AS g(code, action)
WHERE r.rolename = 'purchasing'
ON CONFLICT DO NOTHING;

-- production（work_order / inventory は拠点スコープ — scope_values 既定 '{*}' = 所属拠点すべて）
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, g.code, g.action::app."ACTION",
       (CASE WHEN g.code IN ('work_order','inventory') THEN 'PLANT' ELSE 'ALL' END)::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES
  ('work_order','READ'),('work_order','CREATE'),('work_order','UPDATE'),('work_order','DELETE'),('work_order','EXPORT'),
  ('inventory','READ'),('inventory','CREATE'),('inventory','UPDATE'),('inventory','EXPORT'),
  ('outsource_order','READ'),('outsource_order','UPDATE'),
  ('material_receipt','READ'),('purchase_order','READ'),
  -- 注文明細（SA05）は order_acceptance 権限。在庫照合・キャンセルに UPDATE が要る。
  ('order_acceptance','READ'),('order_acceptance','UPDATE'),
  ('delivery_order','READ'),
  ('master','READ'),('approve','READ')
) AS g(code, action)
WHERE r.rolename = 'production'
ON CONFLICT DO NOTHING;

-- quality（検査記録・検査承認は work_order の UPDATE。work_order は拠点スコープ）
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, g.code, g.action::app."ACTION",
       (CASE WHEN g.code = 'work_order' THEN 'PLANT' ELSE 'ALL' END)::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES
  ('work_order','READ'),('work_order','UPDATE'),
  -- 注文明細（SA05）の参照。旧 work_order 権限で見えていたぶんを引き継ぐ。
  ('order_acceptance','READ'),
  ('inventory','READ'),('master','READ'),('approve','READ')
) AS g(code, action)
WHERE r.rolename = 'quality'
ON CONFLICT DO NOTHING;

-- shipping（delivery_order / inventory は拠点スコープ）
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, g.code, g.action::app."ACTION",
       (CASE WHEN g.code IN ('delivery_order','inventory') THEN 'PLANT' ELSE 'ALL' END)::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES
  ('delivery_order','READ'),('delivery_order','CREATE'),('delivery_order','UPDATE'),('delivery_order','DELETE'),('delivery_order','EXPORT'),
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
  ('delivery_order','READ'),('delivery_note','READ'),
  ('quote','READ'),('order_acceptance','READ'),('price_list','READ'),('master','READ')
) AS g(code, action)
WHERE r.rolename = 'accounting'
ON CONFLICT DO NOTHING;

-- sales_assistant（営業補佐）: 営業データ（試算/見積・価格表・受注請書・設計依頼）を
--   全件 READ のみ。参照マスタも READ。作成・編集・削除・承認は一切不可。
DELETE FROM app.role_permission_relation
WHERE role_id = (SELECT id FROM app.roles WHERE rolename = 'sales_assistant');
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, g.code, 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES
  ('quote'),('price_list'),('order_acceptance'),('design_request'),('master')
) AS g(code)
WHERE r.rolename = 'sales_assistant'
ON CONFLICT DO NOTHING;

-- ─── 部門長ロール（member = 既存部門ロール / manager = 部門フル + 横断閲覧） ───

-- sales_manager（営業部長）: 営業データ（試算/見積・価格表・受注請書・設計依頼）を
--   全件フル（R・C・U・D・E, scope ALL — 他者データの閲覧含む） +
--   参照マスタ READ + 承認閲覧。
DELETE FROM app.role_permission_relation
WHERE role_id = (SELECT id FROM app.roles WHERE rolename = 'sales_manager');
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES
  ('quote'),('price_list'),('order_acceptance'),('design_request')
) AS c(code)
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE'),('DELETE'),('EXPORT')) AS a(action)
WHERE r.rolename = 'sales_manager'
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, g.code, 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r CROSS JOIN (VALUES ('master'),('approve')) AS g(code)
WHERE r.rolename = 'sales_manager'
ON CONFLICT DO NOTHING;

-- purchasing_manager: 自部門フル（RCUDE） + 全業務 READ
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('purchase_order'),('material_receipt'),('outsource_order')) AS c(code)
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE'),('DELETE'),('EXPORT')) AS a(action)
WHERE r.rolename = 'purchasing_manager'
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r CROSS JOIN app.permissions p
WHERE r.rolename = 'purchasing_manager' AND p.code NOT IN ('system', 'kiosk')
ON CONFLICT DO NOTHING;

-- production_manager: 自部門フル（RCUDE） + 全業務 READ
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('work_order'),('inventory'),('outsource_order')) AS c(code)
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE'),('DELETE'),('EXPORT')) AS a(action)
WHERE r.rolename = 'production_manager'
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r CROSS JOIN app.permissions p
WHERE r.rolename = 'production_manager' AND p.code NOT IN ('system', 'kiosk')
ON CONFLICT DO NOTHING;

-- quality_manager: 自部門フル（RCUDE） + 全業務 READ
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('work_order')) AS c(code)
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE'),('DELETE'),('EXPORT')) AS a(action)
WHERE r.rolename = 'quality_manager'
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r CROSS JOIN app.permissions p
WHERE r.rolename = 'quality_manager' AND p.code NOT IN ('system', 'kiosk')
ON CONFLICT DO NOTHING;

-- shipping_manager: 自部門フル（RCUDE） + 全業務 READ
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('delivery_order'),('delivery_note'),('inventory')) AS c(code)
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE'),('DELETE'),('EXPORT')) AS a(action)
WHERE r.rolename = 'shipping_manager'
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r CROSS JOIN app.permissions p
WHERE r.rolename = 'shipping_manager' AND p.code NOT IN ('system', 'kiosk')
ON CONFLICT DO NOTHING;

-- accounting_manager: 自部門フル（RCUDE） + 全業務 READ
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('invoice'),('billing_closing')) AS c(code)
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE'),('DELETE'),('EXPORT')) AS a(action)
WHERE r.rolename = 'accounting_manager'
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r CROSS JOIN app.permissions p
WHERE r.rolename = 'accounting_manager' AND p.code NOT IN ('system', 'kiosk')
ON CONFLICT DO NOTHING;
