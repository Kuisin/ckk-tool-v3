-- analytics スキーマ — Metabase / AI(MCP) 用の名前解決済みレポート用ビュー層。
--
-- 生の 108 テーブルは ID 列だらけで、関連レコードの「名前」（顧客・営業担当・
-- 製品名など）が多段 FK の先にあって BI から読めない（特に
-- order_lines → order_acceptances → sales_rep は複合キーで Metabase から辿れない）。
-- ここで各業務エンティティを 1 ビューに平坦化し、FK を名前へ解決して公開する。
-- Metabase db 5「CKK 業務」と MCP はこの analytics.v_* を参照する。
--
-- 規約:
--   * すべて WITH (security_invoker = true)。ビューは「問い合わせたロール」の権限で
--     実行されるので、grants.sql の metabase_ro マスキング（password_hash 等の列/表
--     REVOKE）がビュー越しでも効く。定義者権限ビューだとマスキングを素通ししてしまう。
--     ⇒ ビューは安全な列だけを SELECT し、マスク対象列・表は参照しない。
--   * マスタ参照は必ず LEFT JOIN（顧客・製品・営業担当・需要家は IMPORT/DRAFT 段階で
--     NULL になり得る。INNER だと作成途中の行が黙って消える）。
--   * 名前は文字列で公開: マスタは coalesce(x.name->>'ja', x.name->>'en')、
--     人は users.display_name（plain text）。マスタは name_ja / name_en も分けて出す。
--   * 書類番号は既存 build-business-dashboards.py と同じ導出:
--     'ORD-'||year_month||'-'||lpad(seq,5,'0') など。注文明細は枝番 -NN を付与。
--   * 列名は英 snake_case（日本語表示は Metabase 側 metabase-business-ja.sql で付ける）。
--   * 冪等。列構成を変えるときは CREATE OR REPLACE では消せないので DROP VIEW してから。
--     権限は grants.sql（analytics ブロック）が付与する。
--
--   docker exec -i shared-db psql -U postgres -d ckk -v ON_ERROR_STOP=1 < analytics-views.sql

CREATE SCHEMA IF NOT EXISTS analytics;

-- =====================================================================
-- 販売 (Sales)
-- =====================================================================

CREATE OR REPLACE VIEW analytics.v_estimates WITH (security_invoker = true) AS
SELECT
  'EST-'||e.year_month||'-'||lpad(e.seq::text,5,'0') AS estimate_no,
  e.year_month, e.seq, e.name, e.tool_type, e.status,
  coalesce(cust.name->>'ja', cust.name->>'en')   AS customer_name,
  coalesce(prod.name->>'ja', prod.name->>'en')   AS product_name,
  coalesce(mt.name->>'ja',   mt.name->>'en')      AS material_type_name,
  su.display_name                                 AS sales_staff,
  cu.display_name                                 AS created_by_name,
  e.reference_unit_price, e.reference_date, e.registered_at,
  e.created_at, e.updated_at
FROM app.estimates e
LEFT JOIN app.business_partners cust ON cust.id = e.customer_bp_id
LEFT JOIN app.products prod          ON prod.id = e.product_id
LEFT JOIN app.material_types mt      ON mt.id = e.material_type_id
LEFT JOIN app.users su               ON su.id = e.sales_rep_id
LEFT JOIN app.users cu               ON cu.id = e.created_by;

CREATE OR REPLACE VIEW analytics.v_price_list_entries WITH (security_invoker = true) AS
SELECT
  'PRC-'||pe.year_month||'-'||lpad(pe.seq::text,5,'0') AS price_list_no,
  pe.year_month, pe.seq, pe.currency, pe.is_active,
  coalesce(cust.name->>'ja', cust.name->>'en') AS customer_name,
  coalesce(prod.name->>'ja', prod.name->>'en') AS product_name,
  su.display_name AS sales_staff,
  pe.created_at, pe.updated_at
FROM app.price_list_entries pe
LEFT JOIN app.business_partners cust ON cust.id = pe.customer_bp_id
LEFT JOIN app.products prod          ON prod.id = pe.product_id
LEFT JOIN app.users su               ON su.id = pe.sales_rep_id;

CREATE OR REPLACE VIEW analytics.v_price_list_variants WITH (security_invoker = true) AS
SELECT
  v.id,
  'PRC-'||v.entry_year_month||'-'||lpad(v.entry_seq::text,5,'0') AS price_list_no,
  coalesce(cust.name->>'ja', cust.name->>'en') AS customer_name,
  coalesce(prod.name->>'ja', prod.name->>'en') AS product_name,
  v.order_type, v.base_unit_price, v.valid_from, v.valid_until,
  CASE WHEN v.estimate_year_month IS NOT NULL
       THEN 'EST-'||v.estimate_year_month||'-'||lpad(v.estimate_seq::text,5,'0') END AS estimate_no,
  v.is_active, v.created_at, v.updated_at
FROM app.price_list_variants v
JOIN app.price_list_entries pe ON pe.year_month = v.entry_year_month AND pe.seq = v.entry_seq
LEFT JOIN app.business_partners cust ON cust.id = pe.customer_bp_id
LEFT JOIN app.products prod          ON prod.id = pe.product_id;

CREATE OR REPLACE VIEW analytics.v_quotes WITH (security_invoker = true) AS
SELECT
  'QOT-'||q.year_month||'-'||lpad(q.seq::text,5,'0') AS quote_no,
  q.year_month, q.seq, q.status, q.valid_until,
  coalesce(cust.name->>'ja', cust.name->>'en')   AS customer_name,
  coalesce(branch.name->>'ja', branch.name->>'en') AS customer_branch_name,
  su.display_name AS sales_staff,
  cu.display_name AS created_by_name,
  q.created_at, q.updated_at
FROM app.quotes q
LEFT JOIN app.business_partners cust   ON cust.id = q.customer_bp_id
LEFT JOIN app.business_partners branch ON branch.id = q.customer_branch_bp_id
LEFT JOIN app.users su ON su.id = q.sales_rep_id
LEFT JOIN app.users cu ON cu.id = q.created_by;

CREATE OR REPLACE VIEW analytics.v_quote_items WITH (security_invoker = true) AS
SELECT
  qi.id,
  'QOT-'||qi.quote_year_month||'-'||lpad(qi.quote_seq::text,5,'0') AS quote_no,
  coalesce(prod.name->>'ja', prod.name->>'en') AS product_name,
  qi.order_type, qi.quantity, qi.unit_price, qi.discount_amount, qi.amount,
  qi.delivery_date, qi.sort_order
FROM app.quote_items qi
LEFT JOIN app.products prod ON prod.id = qi.product_id;

CREATE OR REPLACE VIEW analytics.v_order_acceptances WITH (security_invoker = true) AS
SELECT
  'ORD-'||oa.year_month||'-'||lpad(oa.seq::text,5,'0') AS order_no,
  oa.year_month, oa.seq, oa.status, oa.order_date, oa.customer_order_ref,
  coalesce(cust.name->>'ja', cust.name->>'en')     AS customer_name,
  coalesce(branch.name->>'ja', branch.name->>'en') AS customer_branch_name,
  coalesce(ship.name->>'ja', ship.name->>'en')     AS ship_to_name,
  su.display_name AS sales_staff,
  cu.display_name AS created_by_name,
  coalesce(pl.name->>'ja', pl.name->>'en')         AS assigned_plant_name,
  oa.created_at, oa.updated_at
FROM app.order_acceptances oa
LEFT JOIN app.business_partners cust   ON cust.id = oa.customer_bp_id
LEFT JOIN app.business_partners branch ON branch.id = oa.customer_branch_bp_id
LEFT JOIN app.business_partners ship   ON ship.id = oa.ship_to_bp_id
LEFT JOIN app.users su ON su.id = oa.sales_rep_id
LEFT JOIN app.users cu ON cu.id = oa.created_by
LEFT JOIN app.plants pl ON pl.id = oa.assigned_plant_id;

-- 注文明細 — 報告された多段ケース（明細→請書ヘッダ→営業担当）。
CREATE OR REPLACE VIEW analytics.v_order_lines WITH (security_invoker = true) AS
SELECT
  ol.id,
  'ORD-'||ol.acceptance_year_month||'-'||lpad(ol.acceptance_seq::text,5,'0')
    || CASE WHEN ol.branch IS NOT NULL THEN '-'||lpad(ol.branch::text,2,'0') ELSE '' END AS order_line_no,
  ol.acceptance_year_month, ol.acceptance_seq, ol.branch,
  oa.status AS acceptance_status, oa.order_date, oa.customer_order_ref,
  coalesce(cust.name->>'ja', cust.name->>'en') AS customer_name,
  su.display_name                              AS sales_staff,
  coalesce(prod.name->>'ja', prod.name->>'en') AS product_name,
  ol.product_text,
  coalesce(eu.name->>'ja', eu.name->>'en')     AS end_user_name,
  ol.order_type, ol.quantity, ol.unit_price, ol.amount, ol.delivery_date,
  ol.status, ol.lot_number, ol.is_locked,
  ol.created_at, ol.updated_at
FROM app.order_lines ol
JOIN app.order_acceptances oa
  ON oa.year_month = ol.acceptance_year_month AND oa.seq = ol.acceptance_seq
LEFT JOIN app.business_partners cust ON cust.id = oa.customer_bp_id
LEFT JOIN app.users su               ON su.id = oa.sales_rep_id
LEFT JOIN app.products prod          ON prod.id = ol.product_id
LEFT JOIN app.business_partners eu   ON eu.id = ol.end_user_bp_id;

CREATE OR REPLACE VIEW analytics.v_design_requests WITH (security_invoker = true) AS
SELECT
  dr.id, dr.request_number, dr.trigger, dr.status,
  coalesce(prod.name->>'ja', prod.name->>'en') AS product_name,
  cu.display_name AS created_by_name,
  dr.completed_at, dr.created_at, dr.updated_at
FROM app.design_requests dr
LEFT JOIN app.products prod ON prod.id = dr.product_id
LEFT JOIN app.users cu ON cu.id = dr.created_by;

-- =====================================================================
-- 購買 (Purchasing)
-- =====================================================================

CREATE OR REPLACE VIEW analytics.v_purchase_requests WITH (security_invoker = true) AS
SELECT
  pr.id, pr.request_number, pr.status, pr.purpose,
  ru.display_name AS requested_by_name,
  au.display_name AS approved_by_name,
  pr.requested_at, pr.approved_at, pr.created_at, pr.updated_at
FROM app.purchase_requests pr
LEFT JOIN app.users ru ON ru.id = pr.requested_by
LEFT JOIN app.users au ON au.id = pr.approved_by;

CREATE OR REPLACE VIEW analytics.v_purchase_request_items WITH (security_invoker = true) AS
SELECT
  pri.id, pri.request_id,
  coalesce(m.name->>'ja', m.name->>'en') AS material_name,
  pri.material_id, pri.quantity, pri.unit, pri.desired_at,
  coalesce(pl.name->>'ja', pl.name->>'en') AS plant_name,
  pri.sort_order
FROM app.purchase_request_items pri
LEFT JOIN app.materials m ON m.id = pri.material_id
LEFT JOIN app.plants pl ON pl.id = pri.plant_id;

CREATE OR REPLACE VIEW analytics.v_material_purchase_orders WITH (security_invoker = true) AS
SELECT
  po.id, po.po_number, po.status,
  coalesce(sup.name->>'ja', sup.name->>'en') AS supplier_name,
  po.total_amount, po.currency, po.purchase_date,
  ru.display_name AS requested_by_name,
  au.display_name AS approved_by_name,
  ou.display_name AS ordered_by_name,
  po.requested_at, po.approved_at, po.ordered_at, po.completed_at,
  po.created_at, po.updated_at
FROM app.material_purchase_orders po
LEFT JOIN app.business_partners sup ON sup.id = po.supplier_bp_id
LEFT JOIN app.users ru ON ru.id = po.requested_by
LEFT JOIN app.users au ON au.id = po.approved_by
LEFT JOIN app.users ou ON ou.id = po.ordered_by;

CREATE OR REPLACE VIEW analytics.v_material_purchase_order_items WITH (security_invoker = true) AS
SELECT
  poi.id, poi.purchase_order_id,
  coalesce(m.name->>'ja', m.name->>'en') AS material_name,
  poi.material_id,
  coalesce(pl.name->>'ja', pl.name->>'en') AS plant_name,
  poi.quantity, poi.unit, poi.unit_price, poi.amount, poi.currency,
  poi.received_quantity, poi.expected_at, poi.sort_order
FROM app.material_purchase_order_items poi
LEFT JOIN app.materials m ON m.id = poi.material_id
LEFT JOIN app.plants pl ON pl.id = poi.plant_id;

CREATE OR REPLACE VIEW analytics.v_material_receipts WITH (security_invoker = true) AS
SELECT
  mr.id,
  coalesce(m.name->>'ja', m.name->>'en')   AS material_name,
  mr.material_id,
  coalesce(sup.name->>'ja', sup.name->>'en') AS supplier_name,
  coalesce(pl.name->>'ja', pl.name->>'en') AS plant_name,
  mr.quantity, mr.unit, mr.received_at,
  cu.display_name AS created_by_name,
  mr.created_at
FROM app.material_receipts mr
LEFT JOIN app.materials m ON m.id = mr.material_id
LEFT JOIN app.business_partners sup ON sup.id = mr.supplier_bp_id
LEFT JOIN app.plants pl ON pl.id = mr.plant_id
LEFT JOIN app.users cu ON cu.id = mr.created_by;

-- =====================================================================
-- 生産 (Production)
-- =====================================================================

CREATE OR REPLACE VIEW analytics.v_work_orders WITH (security_invoker = true) AS
SELECT
  'WO-'||wo.year_month||'-'||lpad(wo.seq::text,5,'0') AS work_order_no,
  wo.work_order_number AS lot_number,
  wo.year_month, wo.seq, wo.type, wo.status, wo.approval_status, wo.planned_quantity,
  coalesce(prod.name->>'ja', prod.name->>'en') AS product_name,
  coalesce(m.name->>'ja', m.name->>'en')       AS material_name,
  coalesce(sl.name->>'ja', sl.name->>'en')     AS storage_location_name,
  cu.display_name AS created_by_name,
  au.display_name AS approved_by_name,
  wo.approved_at, wo.started_at, wo.completed_at, wo.created_at, wo.updated_at
FROM app.work_orders wo
LEFT JOIN app.products prod          ON prod.id = wo.product_id
LEFT JOIN app.materials m            ON m.id = wo.material_id
LEFT JOIN app.storage_locations sl   ON sl.id = wo.storage_location_id
LEFT JOIN app.users cu ON cu.id = wo.created_by
LEFT JOIN app.users au ON au.id = wo.approved_by;

CREATE OR REPLACE VIEW analytics.v_work_order_steps WITH (security_invoker = true) AS
SELECT
  wos.id,
  'WO-'||wo.year_month||'-'||lpad(wo.seq::text,5,'0') AS work_order_no,
  wo.work_order_number AS lot_number,
  coalesce(ps.name->>'ja', ps.name->>'en') AS process_step_name,
  ps.category AS process_category,
  wos.execution_location, wos.status,
  coalesce(pl.name->>'ja', pl.name->>'en')   AS plant_name,
  coalesce(sup.name->>'ja', sup.name->>'en') AS supplier_name,
  wos.input_quantity, wos.output_success_quantity,
  wos.output_defect_semi_finished, wos.output_defect_scrap, wos.output_defect_rework,
  wos.started_at, wos.completed_at, wos.sort_order
FROM app.work_order_steps wos
JOIN app.work_orders wo ON wo.id = wos.work_order_id
LEFT JOIN app.process_step_catalog ps ON ps.id = wos.process_step_id
LEFT JOIN app.plants pl  ON pl.id = wos.plant_id
LEFT JOIN app.business_partners sup ON sup.id = wos.supplier_bp_id;

CREATE OR REPLACE VIEW analytics.v_work_order_step_plans WITH (security_invoker = true) AS
SELECT
  sp.id, sp.work_order_step_id,
  coalesce(ps.name->>'ja', ps.name->>'en') AS process_step_name,
  u.display_name AS assignee_name,
  coalesce(wl.name->>'ja', wl.name->>'en') AS work_location_name,
  sp.planned_date, sp.planned_start_at, sp.planned_end_at, sp.quantity,
  sp.created_at
FROM app.work_order_step_plans sp
LEFT JOIN app.work_order_steps wos ON wos.id = sp.work_order_step_id
LEFT JOIN app.process_step_catalog ps ON ps.id = wos.process_step_id
LEFT JOIN app.users u ON u.id = sp.user_id
LEFT JOIN app.work_locations wl ON wl.id = sp.work_location_id;

CREATE OR REPLACE VIEW analytics.v_work_order_step_actuals WITH (security_invoker = true) AS
SELECT
  sa.id, sa.work_order_step_id,
  coalesce(ps.name->>'ja', ps.name->>'en') AS process_step_name,
  u.display_name AS worker_name,
  sa.worked_date, sa.started_at, sa.ended_at, sa.quantity,
  round(extract(epoch FROM (sa.ended_at - sa.started_at))/3600.0, 2) AS work_hours,
  sa.created_at
FROM app.work_order_step_actuals sa
LEFT JOIN app.work_order_steps wos ON wos.id = sa.work_order_step_id
LEFT JOIN app.process_step_catalog ps ON ps.id = wos.process_step_id
LEFT JOIN app.users u ON u.id = sa.user_id;

CREATE OR REPLACE VIEW analytics.v_inspection_records WITH (security_invoker = true) AS
SELECT
  ir.id, ir.work_order_step_id,
  coalesce(it.name->>'ja', it.name->>'en') AS template_name,
  ir.status,
  ru.display_name AS recorded_by_name,
  au.display_name AS approved_by_name,
  ir.recorded_at, ir.approved_at
FROM app.inspection_records ir
LEFT JOIN app.inspection_templates it ON it.id = ir.template_id
LEFT JOIN app.users ru ON ru.id = ir.recorded_by
LEFT JOIN app.users au ON au.id = ir.approved_by;

CREATE OR REPLACE VIEW analytics.v_defect_records WITH (security_invoker = true) AS
SELECT
  dr.id, dr.work_order_step_id,
  coalesce(dt.name->>'ja', dt.name->>'en') AS defect_type_name,
  dr.description,
  ru.display_name AS recorded_by_name,
  dr.recorded_at
FROM app.defect_records dr
LEFT JOIN app.defect_types dt ON dt.id = dr.defect_type_id
LEFT JOIN app.users ru ON ru.id = dr.recorded_by;

-- =====================================================================
-- 在庫 (Inventory)
-- =====================================================================

CREATE OR REPLACE VIEW analytics.v_product_inventory WITH (security_invoker = true) AS
SELECT
  pi.id,
  coalesce(prod.name->>'ja', prod.name->>'en') AS product_name,
  pi.product_id,
  coalesce(pl.name->>'ja', pl.name->>'en') AS plant_name,
  coalesce(sl.name->>'ja', sl.name->>'en') AS storage_location_name,
  pi.lot_number, pi.quantity, pi.reserved_quantity, pi.is_semi_finished,
  pi.updated_at
FROM app.product_inventory pi
LEFT JOIN app.products prod ON prod.id = pi.product_id
LEFT JOIN app.plants pl ON pl.id = pi.plant_id
LEFT JOIN app.storage_locations sl ON sl.id = pi.storage_location_id;

CREATE OR REPLACE VIEW analytics.v_material_inventory WITH (security_invoker = true) AS
SELECT
  mi.id,
  coalesce(m.name->>'ja', m.name->>'en') AS material_name,
  mi.material_id,
  coalesce(pl.name->>'ja', pl.name->>'en') AS plant_name,
  coalesce(sl.name->>'ja', sl.name->>'en') AS storage_location_name,
  mi.quantity, mi.reserved_quantity, mi.unit, mi.updated_at
FROM app.material_inventory mi
LEFT JOIN app.materials m ON m.id = mi.material_id
LEFT JOIN app.plants pl ON pl.id = mi.plant_id
LEFT JOIN app.storage_locations sl ON sl.id = mi.storage_location_id;

CREATE OR REPLACE VIEW analytics.v_inventory_reservations WITH (security_invoker = true) AS
SELECT
  r.id, r.inventory_type, r.inventory_id, r.quantity, r.status,
  'ORD-'||ol.acceptance_year_month||'-'||lpad(ol.acceptance_seq::text,5,'0')
    || CASE WHEN ol.branch IS NOT NULL THEN '-'||lpad(ol.branch::text,2,'0') ELSE '' END AS order_line_no,
  CASE WHEN wo.id IS NOT NULL THEN 'WO-'||wo.year_month||'-'||lpad(wo.seq::text,5,'0') END AS work_order_no,
  r.reserved_at, r.confirmed_at, r.released_at
FROM app.inventory_reservations r
LEFT JOIN app.order_lines ol ON ol.id = r.order_line_id
LEFT JOIN app.work_orders wo ON wo.id = r.work_order_id;

CREATE OR REPLACE VIEW analytics.v_inventory_transactions WITH (security_invoker = true) AS
SELECT
  t.id, t.inventory_type, t.inventory_id, t.transaction_type, t.quantity,
  t.reference_type, t.reference_id,
  cu.display_name AS created_by_name,
  t.created_at
FROM app.inventory_transactions t
LEFT JOIN app.users cu ON cu.id = t.created_by;

-- =====================================================================
-- 出荷 (Shipping)
-- =====================================================================

CREATE OR REPLACE VIEW analytics.v_shipping_orders WITH (security_invoker = true) AS
SELECT
  'SHP-'||so.year_month||'-'||lpad(so.seq::text,5,'0') AS shipping_no,
  so.year_month, so.seq, so.type, so.status,
  coalesce(cust.name->>'ja', cust.name->>'en')     AS customer_name,
  coalesce(branch.name->>'ja', branch.name->>'en') AS customer_branch_name,
  su.display_name AS sales_staff,
  coalesce(pl.name->>'ja', pl.name->>'en')         AS from_plant_name,
  CASE WHEN wo.id IS NOT NULL THEN 'WO-'||wo.year_month||'-'||lpad(wo.seq::text,5,'0') END AS work_order_no,
  so.shipped_at, so.created_at, so.updated_at
FROM app.shipping_orders so
LEFT JOIN app.business_partners cust   ON cust.id = so.customer_bp_id
LEFT JOIN app.business_partners branch ON branch.id = so.customer_branch_bp_id
LEFT JOIN app.users su ON su.id = so.sales_rep_id
LEFT JOIN app.plants pl ON pl.id = so.from_plant_id
LEFT JOIN app.work_orders wo ON wo.id = so.work_order_id;

CREATE OR REPLACE VIEW analytics.v_shipping_order_items WITH (security_invoker = true) AS
SELECT
  si.id,
  'SHP-'||si.shipping_order_year_month||'-'||lpad(si.shipping_order_seq::text,5,'0') AS shipping_no,
  coalesce(prod.name->>'ja', prod.name->>'en') AS product_name,
  si.lot_number, si.quantity, si.sort_order
FROM app.shipping_order_items si
LEFT JOIN app.products prod ON prod.id = si.product_id;

CREATE OR REPLACE VIEW analytics.v_delivery_notes WITH (security_invoker = true) AS
SELECT
  'DRN-'||dn.year_month||'-'||lpad(dn.seq::text,5,'0') AS delivery_no,
  dn.year_month, dn.seq, dn.delivery_method, dn.status, dn.include_price,
  coalesce(rc.name->>'ja', rc.name->>'en')   AS recipient_name,
  coalesce(rb.name->>'ja', rb.name->>'en')   AS recipient_branch_name,
  coalesce(eu.name->>'ja', eu.name->>'en')   AS end_user_name,
  su.display_name AS sales_staff,
  dn.delivered_at, dn.created_at, dn.updated_at
FROM app.delivery_notes dn
LEFT JOIN app.business_partners rc ON rc.id = dn.recipient_bp_id
LEFT JOIN app.business_partners rb ON rb.id = dn.recipient_branch_bp_id
LEFT JOIN app.business_partners eu ON eu.id = dn.end_user_bp_id
LEFT JOIN app.users su ON su.id = dn.sales_rep_id;

CREATE OR REPLACE VIEW analytics.v_delivery_note_items WITH (security_invoker = true) AS
SELECT
  di.id,
  'DRN-'||di.delivery_note_year_month||'-'||lpad(di.delivery_note_seq::text,5,'0') AS delivery_no,
  coalesce(prod.name->>'ja', prod.name->>'en') AS product_name,
  di.quantity, di.unit_price, di.amount, di.sort_order
FROM app.delivery_note_items di
LEFT JOIN app.products prod ON prod.id = di.product_id;

-- =====================================================================
-- 請求 (Billing)
-- =====================================================================

CREATE OR REPLACE VIEW analytics.v_invoices WITH (security_invoker = true) AS
SELECT
  'INV-'||i.year_month||'-'||lpad(i.seq::text,5,'0') AS invoice_no,
  i.year_month, i.seq, i.status,
  coalesce(cust.name->>'ja', cust.name->>'en')     AS customer_name,
  coalesce(branch.name->>'ja', branch.name->>'en') AS customer_branch_name,
  su.display_name AS sales_staff,
  i.billing_period_from, i.billing_period_to,
  i.subtotal, i.tax_amount, i.total_amount,
  i.issued_at, i.due_date, i.sent_at, i.created_at, i.updated_at
FROM app.invoices i
LEFT JOIN app.business_partners cust   ON cust.id = i.customer_bp_id
LEFT JOIN app.business_partners branch ON branch.id = i.customer_branch_bp_id
LEFT JOIN app.users su ON su.id = i.sales_rep_id;

CREATE OR REPLACE VIEW analytics.v_invoice_items WITH (security_invoker = true) AS
SELECT
  ii.id,
  'INV-'||ii.invoice_year_month||'-'||lpad(ii.invoice_seq::text,5,'0') AS invoice_no,
  ii.description->>'ja' AS description,
  ii.quantity, ii.unit_price, ii.amount, ii.sort_order
FROM app.invoice_items ii;

CREATE OR REPLACE VIEW analytics.v_billing_closings WITH (security_invoker = true) AS
SELECT
  bc.id,
  coalesce(cust.name->>'ja', cust.name->>'en') AS customer_name,
  bc.closing_date, bc.status, bc.total_amount,
  pu.display_name AS processed_by_name,
  bc.processed_at, bc.created_at
FROM app.billing_closings bc
LEFT JOIN app.business_partners cust ON cust.id = bc.customer_bp_id
LEFT JOIN app.users pu ON pu.id = bc.processed_by;

-- =====================================================================
-- 承認 (Approvals)
-- =====================================================================

CREATE OR REPLACE VIEW analytics.v_approval_requests WITH (security_invoker = true) AS
SELECT
  ar.id, ar.target_type, ar.target_id, ar.status, ar.step_no, ar.step_count,
  coalesce(ag.name->>'ja', ag.name->>'en') AS approval_group_name,
  ar.mode,
  ru.display_name AS requested_by_name,
  ar.requested_at
FROM app.approval_requests ar
LEFT JOIN app.approval_groups ag ON ag.id = ar.group_id
LEFT JOIN app.users ru ON ru.id = ar.requested_by;

CREATE OR REPLACE VIEW analytics.v_approval_records WITH (security_invoker = true) AS
SELECT
  arc.id, arc.approval_request_id, arc.action, arc.comment,
  ap.display_name AS approver_name,
  df.display_name AS delegate_for_name,
  arc.acted_at
FROM app.approval_records arc
LEFT JOIN app.users ap ON ap.id = arc.approver_id
LEFT JOIN app.users df ON df.id = arc.delegate_for_id;

-- =====================================================================
-- マスタ (Masters) — 名前は ja/en に分割、安全な列のみ
-- =====================================================================

CREATE OR REPLACE VIEW analytics.v_business_partners WITH (security_invoker = true) AS
SELECT
  bp.id, bp.bp_code,
  bp.name->>'ja' AS name_ja, bp.name->>'en' AS name_en,
  bp.name_kana, bp.short_name, bp.country_code,
  r.roles,
  ca.customer_code, ca.closing_day, ca.payment_terms_days, ca.tax_type, ca.invoice_method,
  va.vendor_code, va.vendor_type, va.lead_time_days,
  bp.is_active, bp.created_at, bp.updated_at
FROM app.business_partners bp
LEFT JOIN LATERAL (
  SELECT array_agg(ra.role ORDER BY ra.role) AS roles
  FROM app.bp_role_assignments ra WHERE ra.bp_id = bp.id AND ra.is_active
) r ON true
LEFT JOIN app.bp_customer_attrs ca ON ca.bp_id = bp.id
LEFT JOIN app.bp_vendor_attrs   va ON va.bp_id = bp.id;

CREATE OR REPLACE VIEW analytics.v_products WITH (security_invoker = true) AS
SELECT
  p.id, p.name->>'ja' AS name_ja, p.name->>'en' AS name_en,
  coalesce(mt.name->>'ja', mt.name->>'en') AS material_type_name,
  p.material_type_id, p.diameter_mm, p.length_mm, p.unit, p.is_active,
  p.created_at, p.updated_at
FROM app.products p
LEFT JOIN app.material_types mt ON mt.id = p.material_type_id;

CREATE OR REPLACE VIEW analytics.v_materials WITH (security_invoker = true) AS
SELECT
  m.id, m.name->>'ja' AS name_ja, m.name->>'en' AS name_en,
  coalesce(mt.name->>'ja', mt.name->>'en') AS material_type_name,
  m.material_type_id, m.diameter_mm, m.length_mm,
  coalesce(sf.name->>'ja', sf.name->>'en') AS surface_finish_name,
  m.unit, m.manufacturer_model, m.is_active, m.created_at, m.updated_at
FROM app.materials m
LEFT JOIN app.material_types mt ON mt.id = m.material_type_id
LEFT JOIN app.material_surface_finishes sf ON sf.code = m.surface_finish_code;

CREATE OR REPLACE VIEW analytics.v_material_types WITH (security_invoker = true) AS
SELECT
  mt.id, mt.code, mt.name->>'ja' AS name_ja, mt.name->>'en' AS name_en,
  coalesce(mf.name->>'ja', mf.name->>'en') AS manufacturer_name,
  coalesce(gr.name->>'ja', gr.name->>'en') AS grade_name,
  coalesce(sh.name->>'ja', sh.name->>'en') AS shape_name,
  mt.is_active, mt.created_at, mt.updated_at
FROM app.material_types mt
LEFT JOIN app.material_manufacturers mf ON mf.code = mt.manufacturer_code
LEFT JOIN app.material_manufacturer_grades gr
       ON gr.manufacturer_code = mt.manufacturer_code AND gr.code = mt.grade_code
LEFT JOIN app.material_shapes sh ON sh.code = mt.shape_code;

CREATE OR REPLACE VIEW analytics.v_plants WITH (security_invoker = true) AS
SELECT
  pl.id, pl.code, pl.name->>'ja' AS name_ja, pl.name->>'en' AS name_en,
  pl.country_code,
  coalesce(rg.name->>'ja', rg.name->>'en') AS region_name,
  pl.is_active, pl.created_at, pl.updated_at
FROM app.plants pl
LEFT JOIN app.regions rg ON rg.id = pl.region_id;

CREATE OR REPLACE VIEW analytics.v_users WITH (security_invoker = true) AS
SELECT
  u.id, u.username, u.display_name, u.email, u."group", u.is_active,
  u.last_login_at, u.created_at, u.updated_at
FROM app.users u;

CREATE OR REPLACE VIEW analytics.v_process_step_catalog WITH (security_invoker = true) AS
SELECT
  ps.id, ps.code, ps.name->>'ja' AS name_ja, ps.name->>'en' AS name_en,
  ps.category, ps.execution_location, ps.is_sync_capable, ps.is_inspection,
  ps.is_approval_step, ps.is_active
FROM app.process_step_catalog ps;

CREATE OR REPLACE VIEW analytics.v_inspection_templates WITH (security_invoker = true) AS
SELECT
  it.id, it.code, it.name->>'ja' AS name_ja, it.name->>'en' AS name_en,
  coalesce(ps.name->>'ja', ps.name->>'en') AS related_process_step_name,
  it.version, it.is_active, it.created_at, it.updated_at
FROM app.inspection_templates it
LEFT JOIN app.process_step_catalog ps ON ps.id = it.related_process_step_id;

CREATE OR REPLACE VIEW analytics.v_defect_types WITH (security_invoker = true) AS
SELECT
  dt.id, dt.code, dt.name->>'ja' AS name_ja, dt.name->>'en' AS name_en,
  dt.is_active, dt.sort_order
FROM app.defect_types dt;
