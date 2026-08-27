-- roles-seed.sql — 本番運用ロール一式（権限マトリクス付き・冪等）。
--
-- 適用: cd shared-db && pnpm remote sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/roles-seed.sql'
--
-- 前提: rbac-seed.sql（permissions 18 コード + admin/staff ロール）適用済み。
-- 本番ではここで定義するロールを実ユーザーへ割り当てる（user_role_relation）。
-- 承認は権限アクションでは管理しない — APPROVE グラントは全廃（rbac-seed.sql が
-- 削除する）。承認できる人は承認設定（MS0B）の承認グループ所属だけが決め、
-- RBAC 側の要件はその書類の READ / UPDATE（閲覧または編集）のみ。
--
-- 管理系 2 コードは業務ロールに配らない:
--   system — システム管理（SY01–SY0C）。admin のみ。
--   kiosk  — 共有端末の管理（SY08–SY0A）。admin のみ（CLAUDE.md「admin-only」）。
--            以前は「system 以外の全コード READ」の一括付与に kiosk が混ざり、
--            管理職・部門長・閲覧ロールに QRカード/端末管理の READ が付いていた。
--   admin_manual は一括付与の対象（DC02 管理マニュアルは管理職も読む）。
--
-- マトリクス（R=READ C=CREATE U=UPDATE D=DELETE E=EXPORT）:
--   manager    : 全業務 R+E（承認者・閲覧横断 — 承認の可否は MS0B のグループ所属）
--   sales (営業メンバー)  : 見積(quote)/価格表(price_list)/受注請書(order_acceptance)/
--                           設計依頼(design_request) C·R·U（自分=OWN）+ マスタ R
--   purchasing : 購買依頼・発注/入荷/外注 RCUDE、在庫 R、他 R
--   production : 指示書 RCUDE（拠点スコープ）、在庫 RCUE（拠点スコープ）、
--                受注明細 RU、外注 RU、設計依頼 RU（図面をつくる側）、他 R
--   quality    : 指示書（検査記録・検査承認） RU（拠点スコープ）、他 R
--   shipping   : 出荷書/納品書 RCUDE（出荷書は拠点スコープ）、在庫 RU（拠点スコープ）、他 R
--   accounting : 請求書/締日 RCUDE、販売・出荷 R、他 R
--   viewer     : 全業務 R
--   sales_assistant (営業補佐) : 営業 4 コード R（全件=ALL）+ マスタ R。作成/編集/承認なし
--   sales_manager (営業部長)   : 営業 4 コード R·C·U·D·E（全件=ALL）+ マスタ/承認 R
--   <division>_manager（×5・他部門長） : 自部門コード RCUDE + 全業務 R
--   （member = 既存の部門ロール。manager = 部門フル + 横断閲覧 + 承認）

BEGIN;

-- ─── ロール ──────────────────────────────────────────────────────────────────
INSERT INTO app.roles (is_system, rolename, display_name, description) VALUES
  (true, 'manager',    '{"ja":"管理職（承認者）","en":"Manager"}',      '{"ja":"全業務の閲覧・承認・エクスポート","en":""}'),
  (true, 'sales',      '{"ja":"営業","en":"Sales"}',                    '{"ja":"見積・価格表・受注請書・設計依頼（自分のデータ）","en":""}'),
  (true, 'purchasing', '{"ja":"購買","en":"Purchasing"}',               '{"ja":"購買依頼・素材発注・入荷・外注","en":""}'),
  (true, 'production', '{"ja":"製造・生産管理","en":"Production"}',     '{"ja":"受注明細・指示書・工程実行・在庫・設計依頼","en":""}'),
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
  -- 設計依頼（SA06）— 図面を作るのは製造なので、担当者として着手・完了できる必要がある。
  -- これが無いと「担当に指定されました」の通知を開いた先が 403 になる。
  ('design_request','READ'),('design_request','UPDATE'),
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

COMMIT;
