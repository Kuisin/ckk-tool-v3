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

-- 金額系ビューは通貨換算列を末尾に持つ:
--   currency（書類/製品の通貨。既定 JPY）
--   *_jpy = 金額 × 100 ÷ rate_per_100_jpy（rate_per_100_jpy = 100 円で買えるその通貨量。JPY = 100）
--   *_usd = 金額 × USD の rate_per_100_jpy ÷ 自通貨の rate_per_100_jpy
-- レートは app.currencies（手動更新の分析用換算）。原値の列はそのまま残す。

-- =====================================================================
-- 通貨 (Currency)
-- =====================================================================

DROP VIEW IF EXISTS analytics.v_currencies;  -- 列名変更(rate_per_100_jpy)のため作り直し
CREATE OR REPLACE VIEW analytics.v_currencies WITH (security_invoker = true) AS
SELECT
  c.code,
  c.name->>'ja' AS name_ja, c.name->>'en' AS name_en,
  c.rate_per_100_jpy, c.is_active, c.sort_order, c.updated_at
FROM app.currencies c;

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
  v.is_active, v.created_at, v.updated_at,
  pe.currency,
  round(v.base_unit_price * 100 / nullif(cur.rate_per_100_jpy, 0), 2)                   AS base_unit_price_jpy,
  round(v.base_unit_price * usd.rate_per_100_jpy / nullif(cur.rate_per_100_jpy, 0), 2) AS base_unit_price_usd
FROM app.price_list_variants v
JOIN app.price_list_entries pe ON pe.year_month = v.entry_year_month AND pe.seq = v.entry_seq
LEFT JOIN app.business_partners cust ON cust.id = pe.customer_bp_id
LEFT JOIN app.products prod          ON prod.id = pe.product_id
LEFT JOIN app.currencies cur         ON cur.code = pe.currency
LEFT JOIN app.currencies usd         ON usd.code = 'USD';

CREATE OR REPLACE VIEW analytics.v_quotes WITH (security_invoker = true) AS
SELECT
  'QOT-'||q.year_month||'-'||lpad(q.seq::text,5,'0') AS quote_no,
  q.year_month, q.seq, q.status, q.valid_until,
  coalesce(cust.name->>'ja', cust.name->>'en')   AS customer_name,
  coalesce(branch.name->>'ja', branch.name->>'en') AS customer_branch_name,
  su.display_name AS sales_staff,
  cu.display_name AS created_by_name,
  q.created_at, q.updated_at,
  q.currency
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
  qi.delivery_date, qi.sort_order,
  q.currency,
  round(qi.unit_price * 100 / nullif(cur.rate_per_100_jpy, 0), 2)                   AS unit_price_jpy,
  round(qi.unit_price * usd.rate_per_100_jpy / nullif(cur.rate_per_100_jpy, 0), 2) AS unit_price_usd,
  round(qi.amount * 100 / nullif(cur.rate_per_100_jpy, 0), 2)                       AS amount_jpy,
  round(qi.amount * usd.rate_per_100_jpy / nullif(cur.rate_per_100_jpy, 0), 2)     AS amount_usd
FROM app.quote_items qi
LEFT JOIN app.products prod ON prod.id = qi.product_id
LEFT JOIN app.quotes q ON q.year_month = qi.quote_year_month AND q.seq = qi.quote_seq
LEFT JOIN app.currencies cur ON cur.code = q.currency
LEFT JOIN app.currencies usd ON usd.code = 'USD';

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
  oa.created_at, oa.updated_at,
  oa.currency,
  CASE WHEN oa.quote_year_month IS NOT NULL THEN
    'QOT-'||oa.quote_year_month||'-'||lpad(oa.quote_seq::text,5,'0') END AS quote_no
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
  ol.created_at, ol.updated_at,
  oa.currency,
  round(ol.unit_price * 100 / nullif(cur.rate_per_100_jpy, 0), 2)                     AS unit_price_jpy,
  round(ol.unit_price * usd.rate_per_100_jpy / nullif(cur.rate_per_100_jpy, 0), 2)   AS unit_price_usd,
  round(ol.amount * 100 / nullif(cur.rate_per_100_jpy, 0), 2)                         AS amount_jpy,
  round(ol.amount * usd.rate_per_100_jpy / nullif(cur.rate_per_100_jpy, 0), 2)       AS amount_usd,
  'ORD-'||ol.acceptance_year_month||'-'||lpad(ol.acceptance_seq::text,5,'0') AS order_no,
  CASE WHEN oa.quote_year_month IS NOT NULL THEN
    'QOT-'||oa.quote_year_month||'-'||lpad(oa.quote_seq::text,5,'0') END AS quote_no
FROM app.order_lines ol
JOIN app.order_acceptances oa
  ON oa.year_month = ol.acceptance_year_month AND oa.seq = ol.acceptance_seq
LEFT JOIN app.business_partners cust ON cust.id = oa.customer_bp_id
LEFT JOIN app.users su               ON su.id = oa.sales_rep_id
LEFT JOIN app.products prod          ON prod.id = ol.product_id
LEFT JOIN app.business_partners eu   ON eu.id = ol.end_user_bp_id
LEFT JOIN app.currencies cur         ON cur.code = oa.currency
LEFT JOIN app.currencies usd         ON usd.code = 'USD';

CREATE OR REPLACE VIEW analytics.v_design_requests WITH (security_invoker = true) AS
SELECT
  dr.id, dr.request_number, dr.trigger, dr.status,
  coalesce(prod.name->>'ja', prod.name->>'en') AS product_name,
  cu.display_name AS created_by_name,
  dr.completed_at, dr.created_at, dr.updated_at,
  CASE WHEN ol.id IS NOT NULL THEN
    'ORD-'||ol.acceptance_year_month||'-'||lpad(ol.acceptance_seq::text,5,'0')
      || CASE WHEN ol.branch IS NOT NULL THEN '-'||lpad(ol.branch::text,2,'0') ELSE '' END
  END AS order_line_no,
  CASE WHEN dr.quote_year_month IS NOT NULL THEN
    'QOT-'||dr.quote_year_month||'-'||lpad(dr.quote_seq::text,5,'0') END AS quote_no,
  -- ⚠️ 列は必ず末尾に足すこと。CREATE OR REPLACE VIEW は既存列の並べ替え・改名を
  -- 拒否するので、途中に挿入すると db-migrate が ON_ERROR_STOP で落ち、
  -- デプロイ全体が失敗扱いになる。
  au.display_name AS assignee_name,
  dr.requested_at,
  dr.approved_at,
  dr.started_at,
  dr.cancelled_at,
  dr.cancel_reason,
  dr.kind,
  dr.desired_at,
  dr.priority,
  dr.change_reason,
  coalesce(cbp.name->>'ja', cbp.name->>'en') AS customer_name
FROM app.design_requests dr
LEFT JOIN app.products prod ON prod.id = dr.product_id
LEFT JOIN app.users cu ON cu.id = dr.created_by
LEFT JOIN app.users au ON au.id = dr.assignee_id
LEFT JOIN app.business_partners cbp ON cbp.id = dr.customer_bp_id
LEFT JOIN app.order_lines ol ON ol.id = dr.order_line_id;

-- =====================================================================
-- 購買 (Purchasing)
-- =====================================================================

CREATE OR REPLACE VIEW analytics.v_purchase_requests WITH (security_invoker = true) AS
SELECT
  pr.id, pr.request_number, pr.status, pr.purpose,
  ru.display_name AS requested_by_name,
  au.display_name AS approved_by_name,
  pr.requested_at, pr.approved_at, pr.created_at, pr.updated_at,
  po.po_number
FROM app.purchase_requests pr
LEFT JOIN app.users ru ON ru.id = pr.requested_by
LEFT JOIN app.users au ON au.id = pr.approved_by
LEFT JOIN app.material_purchase_orders po ON po.id = pr.purchase_order_id;

CREATE OR REPLACE VIEW analytics.v_purchase_request_items WITH (security_invoker = true) AS
SELECT
  pri.id, pri.request_id,
  coalesce(m.name->>'ja', m.name->>'en') AS material_name,
  pri.material_id, pri.quantity, pri.unit, pri.desired_at,
  coalesce(pl.name->>'ja', pl.name->>'en') AS plant_name,
  pri.sort_order,
  pr.request_number
FROM app.purchase_request_items pri
LEFT JOIN app.materials m ON m.id = pri.material_id
LEFT JOIN app.plants pl ON pl.id = pri.plant_id
LEFT JOIN app.purchase_requests pr ON pr.id = pri.request_id;

CREATE OR REPLACE VIEW analytics.v_material_purchase_orders WITH (security_invoker = true) AS
SELECT
  po.id, po.po_number, po.status,
  coalesce(sup.name->>'ja', sup.name->>'en') AS supplier_name,
  po.total_amount, po.currency, po.purchase_date,
  ru.display_name AS requested_by_name,
  au.display_name AS approved_by_name,
  ou.display_name AS ordered_by_name,
  po.requested_at, po.approved_at, po.ordered_at, po.completed_at,
  po.created_at, po.updated_at,
  round(po.total_amount * 100 / nullif(cur.rate_per_100_jpy, 0), 2)                   AS total_amount_jpy,
  round(po.total_amount * usd.rate_per_100_jpy / nullif(cur.rate_per_100_jpy, 0), 2) AS total_amount_usd
FROM app.material_purchase_orders po
LEFT JOIN app.business_partners sup ON sup.id = po.supplier_bp_id
LEFT JOIN app.users ru ON ru.id = po.requested_by
LEFT JOIN app.users au ON au.id = po.approved_by
LEFT JOIN app.users ou ON ou.id = po.ordered_by
LEFT JOIN app.currencies cur ON cur.code = po.currency
LEFT JOIN app.currencies usd ON usd.code = 'USD';

CREATE OR REPLACE VIEW analytics.v_material_purchase_order_items WITH (security_invoker = true) AS
SELECT
  poi.id, poi.purchase_order_id,
  coalesce(m.name->>'ja', m.name->>'en') AS material_name,
  poi.material_id,
  coalesce(pl.name->>'ja', pl.name->>'en') AS plant_name,
  poi.quantity, poi.unit, poi.unit_price, poi.amount, poi.currency,
  poi.received_quantity, poi.expected_at, poi.sort_order,
  round(poi.amount * 100 / nullif(cur.rate_per_100_jpy, 0), 2)                   AS amount_jpy,
  round(poi.amount * usd.rate_per_100_jpy / nullif(cur.rate_per_100_jpy, 0), 2) AS amount_usd,
  po.po_number
FROM app.material_purchase_order_items poi
LEFT JOIN app.material_purchase_orders po ON po.id = poi.purchase_order_id
LEFT JOIN app.materials m ON m.id = poi.material_id
LEFT JOIN app.plants pl ON pl.id = poi.plant_id
LEFT JOIN app.currencies cur ON cur.code = poi.currency
LEFT JOIN app.currencies usd ON usd.code = 'USD';

CREATE OR REPLACE VIEW analytics.v_material_receipts WITH (security_invoker = true) AS
SELECT
  mr.id,
  coalesce(m.name->>'ja', m.name->>'en')   AS material_name,
  mr.material_id,
  coalesce(sup.name->>'ja', sup.name->>'en') AS supplier_name,
  coalesce(pl.name->>'ja', pl.name->>'en') AS plant_name,
  mr.quantity, mr.unit, mr.received_at,
  cu.display_name AS created_by_name,
  mr.created_at,
  po.po_number
FROM app.material_receipts mr
LEFT JOIN app.materials m ON m.id = mr.material_id
LEFT JOIN app.business_partners sup ON sup.id = mr.supplier_bp_id
LEFT JOIN app.plants pl ON pl.id = mr.plant_id
LEFT JOIN app.users cu ON cu.id = mr.created_by
LEFT JOIN app.material_purchase_order_items poi ON poi.id = mr.purchase_order_item_id
LEFT JOIN app.material_purchase_orders po ON po.id = poi.purchase_order_id;

-- =====================================================================
-- 生産 (Production)
-- =====================================================================

CREATE OR REPLACE VIEW analytics.v_work_orders WITH (security_invoker = true) AS
SELECT
  'WOR-'||wo.year_month||'-'||lpad(wo.seq::text,5,'0') AS work_order_no,
  wo.work_order_number AS lot_number,
  wo.year_month, wo.seq, wo.type, wo.status, wo.approval_status, wo.planned_quantity,
  coalesce(prod.name->>'ja', prod.name->>'en') AS product_name,
  coalesce(m.name->>'ja', m.name->>'en')       AS material_name,
  coalesce(sl.name->>'ja', sl.name->>'en')     AS storage_location_name,
  cu.display_name AS created_by_name,
  au.display_name AS approved_by_name,
  wo.approved_at, wo.started_at, wo.completed_at, wo.created_at, wo.updated_at,
  prod.currency,  -- 製品の通貨（指示書自体は通貨を持たない — フィルタ用）
  ords.order_line_nos  -- 割当済み注文明細番号（ORD-…-NN。m:n — 複数はカンマ区切り、割当ゼロ = NULL）
FROM app.work_orders wo
LEFT JOIN app.products prod          ON prod.id = wo.product_id
LEFT JOIN app.materials m            ON m.id = wo.material_id
LEFT JOIN app.storage_locations sl   ON sl.id = wo.storage_location_id
LEFT JOIN app.users cu ON cu.id = wo.created_by
LEFT JOIN app.users au ON au.id = wo.approved_by
LEFT JOIN LATERAL (
  SELECT string_agg(
           'ORD-'||ol.acceptance_year_month||'-'||lpad(ol.acceptance_seq::text,5,'0')
             || CASE WHEN ol.branch IS NOT NULL THEN '-'||lpad(ol.branch::text,2,'0') ELSE '' END,
           ', ' ORDER BY ol.acceptance_year_month, ol.acceptance_seq, ol.branch) AS order_line_nos
  FROM app.work_order_order_lines wol
  JOIN app.order_lines ol ON ol.id = wol.order_line_id
  WHERE wol.work_order_id = wo.id
) ords ON true;

CREATE OR REPLACE VIEW analytics.v_work_order_steps WITH (security_invoker = true) AS
SELECT
  wos.id,
  'WOR-'||wo.year_month||'-'||lpad(wo.seq::text,5,'0') AS work_order_no,
  wo.work_order_number AS lot_number,
  coalesce(ps.name->>'ja', ps.name->>'en') AS process_step_name,
  ps.category AS process_category,
  wos.execution_location, wos.status,
  coalesce(pl.name->>'ja', pl.name->>'en')   AS plant_name,
  coalesce(sup.name->>'ja', sup.name->>'en') AS supplier_name,
  wos.input_quantity, wos.output_success_quantity,
  wos.output_defect_semi_finished, wos.output_defect_scrap, wos.output_defect_rework,
  wos.started_at, wos.completed_at, wos.sort_order,
  ords.order_line_nos  -- 指示書に割当済みの注文明細番号（ORD-…-NN）
FROM app.work_order_steps wos
JOIN app.work_orders wo ON wo.id = wos.work_order_id
LEFT JOIN app.process_step_catalog ps ON ps.id = wos.process_step_id
LEFT JOIN app.plants pl  ON pl.id = wos.plant_id
LEFT JOIN app.business_partners sup ON sup.id = wos.supplier_bp_id
LEFT JOIN LATERAL (
  SELECT string_agg(
           'ORD-'||ol.acceptance_year_month||'-'||lpad(ol.acceptance_seq::text,5,'0')
             || CASE WHEN ol.branch IS NOT NULL THEN '-'||lpad(ol.branch::text,2,'0') ELSE '' END,
           ', ' ORDER BY ol.acceptance_year_month, ol.acceptance_seq, ol.branch) AS order_line_nos
  FROM app.work_order_order_lines wol
  JOIN app.order_lines ol ON ol.id = wol.order_line_id
  WHERE wol.work_order_id = wo.id
) ords ON true;

CREATE OR REPLACE VIEW analytics.v_work_order_step_plans WITH (security_invoker = true) AS
SELECT
  sp.id, sp.work_order_step_id,
  coalesce(ps.name->>'ja', ps.name->>'en') AS process_step_name,
  u.display_name AS assignee_name,
  coalesce(wl.name->>'ja', wl.name->>'en') AS work_location_name,
  sp.planned_date, sp.planned_start_at, sp.planned_end_at, sp.quantity,
  sp.created_at,
  CASE WHEN wo.id IS NOT NULL THEN 'WOR-'||wo.year_month||'-'||lpad(wo.seq::text,5,'0') END AS work_order_no,
  wo.work_order_number AS lot_number
FROM app.work_order_step_plans sp
LEFT JOIN app.work_order_steps wos ON wos.id = sp.work_order_step_id
LEFT JOIN app.work_orders wo ON wo.id = wos.work_order_id
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
  sa.created_at,
  CASE WHEN wo.id IS NOT NULL THEN 'WOR-'||wo.year_month||'-'||lpad(wo.seq::text,5,'0') END AS work_order_no,
  wo.work_order_number AS lot_number
FROM app.work_order_step_actuals sa
LEFT JOIN app.work_order_steps wos ON wos.id = sa.work_order_step_id
LEFT JOIN app.work_orders wo ON wo.id = wos.work_order_id
LEFT JOIN app.process_step_catalog ps ON ps.id = wos.process_step_id
LEFT JOIN app.users u ON u.id = sa.user_id;

CREATE OR REPLACE VIEW analytics.v_inspection_records WITH (security_invoker = true) AS
SELECT
  ir.id, ir.work_order_step_id,
  coalesce(it.name->>'ja', it.name->>'en') AS template_name,
  ir.status,
  ru.display_name AS recorded_by_name,
  au.display_name AS approved_by_name,
  ir.recorded_at, ir.approved_at,
  CASE WHEN wo.id IS NOT NULL THEN 'WOR-'||wo.year_month||'-'||lpad(wo.seq::text,5,'0') END AS work_order_no,
  wo.work_order_number AS lot_number
FROM app.inspection_records ir
LEFT JOIN app.inspection_templates it ON it.id = ir.template_id
LEFT JOIN app.users ru ON ru.id = ir.recorded_by
LEFT JOIN app.users au ON au.id = ir.approved_by
LEFT JOIN app.work_order_steps wos ON wos.id = ir.work_order_step_id
LEFT JOIN app.work_orders wo ON wo.id = wos.work_order_id;

CREATE OR REPLACE VIEW analytics.v_defect_records WITH (security_invoker = true) AS
SELECT
  dr.id, dr.work_order_step_id,
  coalesce(dt.name->>'ja', dt.name->>'en') AS defect_type_name,
  dr.description,
  ru.display_name AS recorded_by_name,
  dr.recorded_at,
  CASE WHEN wo.id IS NOT NULL THEN 'WOR-'||wo.year_month||'-'||lpad(wo.seq::text,5,'0') END AS work_order_no,
  wo.work_order_number AS lot_number
FROM app.defect_records dr
LEFT JOIN app.defect_types dt ON dt.id = dr.defect_type_id
LEFT JOIN app.users ru ON ru.id = dr.recorded_by
LEFT JOIN app.work_order_steps wos ON wos.id = dr.work_order_step_id
LEFT JOIN app.work_orders wo ON wo.id = wos.work_order_id;

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
  pi.updated_at,
  prod.currency,  -- 製品の通貨（フィルタ用）
  CASE WHEN wo.id IS NOT NULL THEN 'WOR-'||wo.year_month||'-'||lpad(wo.seq::text,5,'0') END AS work_order_no
FROM app.product_inventory pi
LEFT JOIN app.products prod ON prod.id = pi.product_id
LEFT JOIN app.plants pl ON pl.id = pi.plant_id
LEFT JOIN app.storage_locations sl ON sl.id = pi.storage_location_id
LEFT JOIN app.work_orders wo ON wo.work_order_number = pi.lot_number;

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
  CASE WHEN wo.id IS NOT NULL THEN 'WOR-'||wo.year_month||'-'||lpad(wo.seq::text,5,'0') END AS work_order_no,
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

-- 出荷書は営業担当スナップショット列を持たない — 明細の注文明細 → 注文請書
-- ヘッダの sales_rep_id から導出する（担当が一意に定まるときだけ名前を出す）。
CREATE OR REPLACE VIEW analytics.v_delivery_orders WITH (security_invoker = true) AS
SELECT
  'DOR-'||dor.year_month||'-'||lpad(dor.seq::text,5,'0') AS delivery_order_no,
  dor.year_month, dor.seq, dor.type, dor.status,
  coalesce(cust.name->>'ja', cust.name->>'en')     AS customer_name,
  coalesce(branch.name->>'ja', branch.name->>'en') AS customer_branch_name,
  rep.sales_staff,
  coalesce(pl.name->>'ja', pl.name->>'en')         AS from_plant_name,
  CASE WHEN wo.id IS NOT NULL THEN 'WOR-'||wo.year_month||'-'||lpad(wo.seq::text,5,'0') END AS work_order_no,
  dor.shipped_at, dor.created_at, dor.updated_at,
  ords.order_line_nos  -- 明細が紐づく注文明細番号（ORD-…-NN。複数はカンマ区切り）
FROM app.delivery_orders dor
LEFT JOIN LATERAL (
  SELECT string_agg(DISTINCT
           'ORD-'||ol.acceptance_year_month||'-'||lpad(ol.acceptance_seq::text,5,'0')
             || CASE WHEN ol.branch IS NOT NULL THEN '-'||lpad(ol.branch::text,2,'0') ELSE '' END,
           ', ') AS order_line_nos
  FROM app.delivery_order_items di2
  JOIN app.order_lines ol ON ol.id = di2.order_line_id
  WHERE di2.delivery_order_year_month = dor.year_month
    AND di2.delivery_order_seq = dor.seq
) ords ON true
LEFT JOIN app.business_partners cust   ON cust.id = dor.customer_bp_id
LEFT JOIN app.business_partners branch ON branch.id = dor.customer_branch_bp_id
LEFT JOIN LATERAL (
  SELECT CASE WHEN count(DISTINCT oa.sales_rep_id) = 1
              THEN max(su.display_name) END AS sales_staff
  FROM app.delivery_order_items di
  JOIN app.order_lines ol        ON ol.id = di.order_line_id
  JOIN app.order_acceptances oa  ON oa.year_month = ol.acceptance_year_month
                                AND oa.seq = ol.acceptance_seq
  LEFT JOIN app.users su         ON su.id = oa.sales_rep_id
  WHERE di.delivery_order_year_month = dor.year_month
    AND di.delivery_order_seq = dor.seq
    AND oa.sales_rep_id IS NOT NULL
) rep ON true
LEFT JOIN app.plants pl ON pl.id = dor.from_plant_id
LEFT JOIN app.work_orders wo ON wo.id = dor.work_order_id;

CREATE OR REPLACE VIEW analytics.v_delivery_order_items WITH (security_invoker = true) AS
SELECT
  di.id,
  'DOR-'||di.delivery_order_year_month||'-'||lpad(di.delivery_order_seq::text,5,'0') AS delivery_order_no,
  coalesce(prod.name->>'ja', prod.name->>'en') AS product_name,
  di.lot_number, di.quantity, di.sort_order,
  CASE WHEN ol.id IS NOT NULL THEN
    'ORD-'||ol.acceptance_year_month||'-'||lpad(ol.acceptance_seq::text,5,'0')
      || CASE WHEN ol.branch IS NOT NULL THEN '-'||lpad(ol.branch::text,2,'0') ELSE '' END
  END AS order_line_no
FROM app.delivery_order_items di
LEFT JOIN app.products prod ON prod.id = di.product_id
LEFT JOIN app.order_lines ol ON ol.id = di.order_line_id;

CREATE OR REPLACE VIEW analytics.v_delivery_notes WITH (security_invoker = true) AS
SELECT
  'DRN-'||dn.year_month||'-'||lpad(dn.seq::text,5,'0') AS delivery_no,
  dn.year_month, dn.seq, dn.delivery_method, dn.status, dn.include_price,
  coalesce(rc.name->>'ja', rc.name->>'en')   AS recipient_name,
  coalesce(rb.name->>'ja', rb.name->>'en')   AS recipient_branch_name,
  coalesce(eu.name->>'ja', eu.name->>'en')   AS end_user_name,
  su.display_name AS sales_staff,
  dn.delivered_at, dn.created_at, dn.updated_at,
  'DOR-'||dn.delivery_order_year_month||'-'||lpad(dn.delivery_order_seq::text,5,'0') AS delivery_order_no,
  ords.order_line_nos  -- 出荷書経由で紐づく注文明細番号（ORD-…-NN）
FROM app.delivery_notes dn
LEFT JOIN app.business_partners rc ON rc.id = dn.recipient_bp_id
LEFT JOIN app.business_partners rb ON rb.id = dn.recipient_branch_bp_id
LEFT JOIN app.business_partners eu ON eu.id = dn.end_user_bp_id
LEFT JOIN app.users su ON su.id = dn.sales_rep_id
LEFT JOIN LATERAL (
  SELECT string_agg(DISTINCT
           'ORD-'||ol.acceptance_year_month||'-'||lpad(ol.acceptance_seq::text,5,'0')
             || CASE WHEN ol.branch IS NOT NULL THEN '-'||lpad(ol.branch::text,2,'0') ELSE '' END,
           ', ') AS order_line_nos
  FROM app.delivery_order_items di
  JOIN app.order_lines ol ON ol.id = di.order_line_id
  WHERE di.delivery_order_year_month = dn.delivery_order_year_month
    AND di.delivery_order_seq = dn.delivery_order_seq
) ords ON true;

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
  i.issued_at, i.due_date, i.sent_at, i.created_at, i.updated_at,
  i.currency,
  round(i.total_amount * 100 / nullif(cur.rate_per_100_jpy, 0), 2)                   AS total_amount_jpy,
  round(i.total_amount * usd.rate_per_100_jpy / nullif(cur.rate_per_100_jpy, 0), 2) AS total_amount_usd
FROM app.invoices i
LEFT JOIN app.business_partners cust   ON cust.id = i.customer_bp_id
LEFT JOIN app.business_partners branch ON branch.id = i.customer_branch_bp_id
LEFT JOIN app.users su ON su.id = i.sales_rep_id
LEFT JOIN app.currencies cur ON cur.code = i.currency
LEFT JOIN app.currencies usd ON usd.code = 'USD';

CREATE OR REPLACE VIEW analytics.v_invoice_items WITH (security_invoker = true) AS
SELECT
  ii.id,
  'INV-'||ii.invoice_year_month||'-'||lpad(ii.invoice_seq::text,5,'0') AS invoice_no,
  ii.description->>'ja' AS description,
  ii.quantity, ii.unit_price, ii.amount, ii.sort_order,
  CASE WHEN ol.id IS NOT NULL THEN
    'ORD-'||ol.acceptance_year_month||'-'||lpad(ol.acceptance_seq::text,5,'0')
      || CASE WHEN ol.branch IS NOT NULL THEN '-'||lpad(ol.branch::text,2,'0') ELSE '' END
  END AS order_line_no,
  CASE WHEN ii.delivery_order_year_month IS NOT NULL THEN
    'DOR-'||ii.delivery_order_year_month||'-'||lpad(ii.delivery_order_seq::text,5,'0')
  END AS delivery_order_no,
  CASE WHEN ii.delivery_note_year_month IS NOT NULL THEN
    'DRN-'||ii.delivery_note_year_month||'-'||lpad(ii.delivery_note_seq::text,5,'0')
  END AS delivery_no
FROM app.invoice_items ii
LEFT JOIN app.order_lines ol ON ol.id = ii.order_line_id;

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
  p.created_at, p.updated_at,
  p.currency
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

-- 利用者ごとの実効権限（1 行 = 1 人）。元は app.user_permission_summary
-- （マイグレーション 20261002090000）。配列は Metabase で読みにくいので
-- カンマ区切りの文字列に落とし、JSON（permissions）は出さない — 詳しく見るのは
-- SY01 の仕事で、ここは「誰が何を持っているか」を横に並べて眺めるためのもの。
CREATE OR REPLACE VIEW analytics.v_user_permissions WITH (security_invoker = true) AS
SELECT
  s.user_id, s.username, s.display_name, s.is_active,
  array_to_string(s.roles, ', ')            AS roles,
  array_to_string(s.permission_codes, ', ') AS permission_codes,
  array_to_string(s.grants, ', ')           AS grants,
  s.grant_count, s.is_superuser
FROM app.user_permission_summary s;

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

-- =====================================================================
-- 表示通貨切替 (Display currency) — ダッシュボードの JPY / USD 切替用
-- =====================================================================
-- 金額カードを「表示通貨」フィルタ 1 つで JPY/USD 切替できるようにするための
-- 縦持ちビュー。1 行を表示通貨ごとに 2 行（JPY / USD）へ展開し、amount_disp に
-- 換算済み金額を持つ。**必ず display_currency で 1 通貨に絞って使う**（絞らずに
-- 合計すると二重計上）— ダッシュボード側は必須フィルタ（既定 JPY）で保証する。
-- アドホック探索は通常の v_order_lines / v_invoices（*_jpy / *_usd 列）を使うこと。

CREATE OR REPLACE VIEW analytics.v_order_lines_disp WITH (security_invoker = true) AS
SELECT
  ol.order_line_no, ol.order_no,
  ol.acceptance_year_month, ol.acceptance_seq, ol.branch,
  ol.status, ol.customer_name, ol.sales_staff, ol.product_name,
  ol.quantity, ol.currency, ol.created_at,
  d.display_currency,
  CASE d.display_currency WHEN 'JPY' THEN ol.amount_jpy     ELSE ol.amount_usd     END AS amount_disp,
  CASE d.display_currency WHEN 'JPY' THEN ol.unit_price_jpy ELSE ol.unit_price_usd END AS unit_price_disp,
  ol.acceptance_status,  -- 請書状態（ダッシュボードの 状態（請書） フィルタ用）
  ol.order_date          -- 注文日（期間フィルタ・月次集計の基準）
FROM analytics.v_order_lines ol
CROSS JOIN (VALUES ('JPY'), ('USD')) AS d(display_currency);

CREATE OR REPLACE VIEW analytics.v_invoices_disp WITH (security_invoker = true) AS
SELECT
  i.invoice_no, i.status, i.customer_name, i.customer_branch_name, i.sales_staff,
  i.currency, i.issued_at, i.created_at,
  d.display_currency,
  CASE d.display_currency WHEN 'JPY' THEN i.total_amount_jpy ELSE i.total_amount_usd END AS total_amount_disp
FROM analytics.v_invoices i
CROSS JOIN (VALUES ('JPY'), ('USD')) AS d(display_currency);

-- =====================================================================
-- フォーム (CM02) — 利用者が項目を組むので、列は固定できない
-- =====================================================================
--
-- 普通の業務表と違い、フォームは**項目そのものが利用者定義**なので「1 列 = 1 項目」の
-- 横長ビューは作れない（フォームごとに列が変わる）。そこで **1 行 = 1 回答 × 1 項目**の
-- 縦持ちで公開する。Metabase 側はスキーマを知らなくても
-- 「field_label で group by して value_text を数える」だけで集計できる。
--
-- 回答者は forms.respondent_visibility を尊重する。アプリが「回答者を表示しない」と
-- 約束したフォームは、BI からも辿れないようにする（ここを素通しにすると、
-- 画面で隠した意味が無くなる）。

CREATE OR REPLACE VIEW analytics.v_forms WITH (security_invoker = true) AS
SELECT
  f.code AS form_code,
  f.title AS form_title,
  CASE f.kind WHEN 'REQUEST' THEN '申請・報告' ELSE 'アンケート' END AS form_kind,
  f.status,
  CASE f.respondent_visibility WHEN 'HIDDEN' THEN '表示しない' ELSE '表示する' END
    AS respondent_visibility,
  f.approval_enabled,
  f.allow_multiple,
  f.current_version AS form_version,
  f.opens_at,
  f.closes_at,
  cu.display_name AS created_by_name,
  f.created_at,
  f.updated_at,
  (SELECT count(*) FROM app.form_responses r
    WHERE r.form_id = f.id AND r.status <> 'DRAFT') AS response_count
FROM app.forms f
LEFT JOIN app.users cu ON cu.id = f.created_by;

CREATE OR REPLACE VIEW analytics.v_form_responses WITH (security_invoker = true) AS
SELECT
  r.response_number AS response_no,
  r.record_no,
  f.code AS form_code,
  f.title AS form_title,
  CASE f.kind WHEN 'REQUEST' THEN '申請・報告' ELSE 'アンケート' END AS form_kind,
  r.status,
  r.version AS form_version,
  -- 「回答者を表示しない」フォームでは名前を出さない（アプリと同じ約束）。
  CASE WHEN f.respondent_visibility = 'SHOWN' THEN u.display_name END AS respondent_name,
  r.submitted_at,
  r.approved_at,
  r.rejected_at,
  r.created_at,
  r.updated_at
FROM app.form_responses r
JOIN app.forms f ON f.id = r.form_id
LEFT JOIN app.users u ON u.id = r.submitted_by
WHERE r.status <> 'DRAFT';

CREATE OR REPLACE VIEW analytics.v_form_answers WITH (security_invoker = true) AS
SELECT
  r.response_number AS response_no,
  r.record_no,
  f.code AS form_code,
  f.title AS form_title,
  r.status,
  CASE WHEN f.respondent_visibility = 'SHOWN' THEN u.display_name END AS respondent_name,
  r.submitted_at,
  r.created_at,
  fld.field_key,
  fld.field_label,
  fld.field_type,
  fld.field_order,
  val.value_text,
  -- 数値・日付は型を分けて出す（Metabase が文字列のまま扱うと集計も並べ替えもできない）
  CASE WHEN fld.field_type = 'number' AND val.value_text ~ '^-?[0-9]+(\.[0-9]+)?$'
       THEN val.value_text::numeric END AS value_number,
  CASE WHEN fld.field_type = 'date' AND val.value_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       THEN val.value_text::date END AS value_date,
  -- 複数選択・添付・サブテーブルは「いくつ入っているか」も出す
  CASE WHEN jsonb_typeof(r.answers -> fld.field_key) = 'array'
       THEN jsonb_array_length(r.answers -> fld.field_key) END AS value_count
FROM app.form_responses r
JOIN app.forms f ON f.id = r.form_id
LEFT JOIN app.users u ON u.id = r.submitted_by
-- 回答は「回答した時点の版」の項目で読む。あとから項目を消しても過去の回答は読める。
JOIN app.form_versions v ON v.form_id = r.form_id AND v.version = r.version
CROSS JOIN LATERAL (
  SELECT
    e->>'key' AS field_key,
    coalesce(e->'label'->>'ja', e->'label'->>'en', e->>'key') AS field_label,
    e->>'type' AS field_type,
    coalesce((e->>'order')::int, 0) AS field_order
  FROM jsonb_array_elements(v.schema) AS e
) fld
CROSS JOIN LATERAL (
  SELECT CASE jsonb_typeof(r.answers -> fld.field_key)
    WHEN 'string' THEN r.answers ->> fld.field_key
    WHEN 'number' THEN r.answers ->> fld.field_key
    -- 業務データ検索は保存済みのラベルを出す（id は人が読めない）
    WHEN 'object' THEN coalesce(
      r.answers -> fld.field_key ->> 'label',
      r.answers -> fld.field_key ->> 'id')
    WHEN 'array' THEN (
      SELECT string_agg(
        CASE jsonb_typeof(x)
          WHEN 'string' THEN x #>> '{}'
          WHEN 'object' THEN coalesce(x ->> 'label', x ->> 'id')
          ELSE NULL END, ', ')
      FROM jsonb_array_elements(r.answers -> fld.field_key) AS x)
    ELSE NULL
  END AS value_text
) val
WHERE r.status <> 'DRAFT'
  -- 表示専用の項目は値を持たない
  AND fld.field_type <> 'related';
