-- e2e-regrind-fixtures.sql — 再研磨の通し確認（e2e-regrind.ts）のための状態を作る。
--
-- デモシードには再研磨に要るものが 1 つも無い（機能が新しいため）。ここで 3 つ作る:
--
--   1. 他社製品 9101「日研ツール 超硬エンドミル φ10」— 再研磨専用の品目。
--      他社が作った工具を預かるときの入れ物で、製造工程リストも製造分の指示書も
--      持てない。
--   2. 共通の再研磨工程リスト 9101 v1 — 製品受入（再研磨）→ 外周研磨 → 出荷前検査。
--      製品にも受注元にも紐づかない（DB の CHECK が守る）。
--   3. 確定済みの注文請書 ORD-209902-00001 と、その **注文種別 REGRIND の明細**
--      （他社製品 9101 × 10 本）。指示書はこの明細から作る。
--   4. 顧客 × 9101 の価格表（REGRIND バリアント）— 出荷後の請求単価まで見るため。
--
-- 何度流しても同じ結果になるよう、先に消してから作る。**指示書と在庫は作らない** —
-- そこは試験が画面から作って、台帳が正しく動くかを見る対象そのものなので。
--
-- 使う既存データ（デモシード）: 顧客 d0000000-…-0001 / 拠点 F01 /
-- 作成者 a0b1c2d3-…-5107 / 不良種類 REGRIND_RETURN（extended-master-seed）。

-- ── 後始末（前回の試験が作った指示書・在庫・伝票も含めて消す）──────────────
DELETE FROM app.inventory_transactions t
 USING app.inventory_movements m, app.work_orders w
 WHERE t.movement_id = m.id
   AND m.source_type = 'work_orders'
   AND m.source_id = w.work_order_number::text
   AND w.product_item_id = 9101;
DELETE FROM app.inventory_movements m
 USING app.work_orders w
 WHERE m.source_type = 'work_orders'
   AND m.source_id = w.work_order_number::text
   AND w.product_item_id = 9101;
DELETE FROM app.inventory_transactions t
 USING app.item_inventory i
 WHERE t.inventory_id = i.id AND i.item_id = 9101;
DELETE FROM app.item_inventory WHERE item_id = 9101;
DELETE FROM app.work_order_step_plans p
 USING app.work_order_steps s, app.work_orders w
 WHERE p.work_order_step_id = s.id AND s.work_order_id = w.id AND w.product_item_id = 9101;
DELETE FROM app.work_order_step_actuals a
 USING app.work_order_steps s, app.work_orders w
 WHERE a.work_order_step_id = s.id AND s.work_order_id = w.id AND w.product_item_id = 9101;
DELETE FROM app.work_order_steps s USING app.work_orders w
 WHERE s.work_order_id = w.id AND w.product_item_id = 9101;
DELETE FROM app.work_order_order_lines l USING app.work_orders w
 WHERE l.work_order_id = w.id AND w.product_item_id = 9101;
DELETE FROM app.work_orders WHERE product_item_id = 9101;

DELETE FROM app.delivery_order_items
 WHERE delivery_order_year_month = '209902';
DELETE FROM app.delivery_orders WHERE year_month = '209902';
DELETE FROM app.order_lines WHERE acceptance_year_month = '209902';
DELETE FROM app.order_acceptances WHERE year_month = '209902';

DELETE FROM app.price_list_tiers t USING app.price_list_variants v
 WHERE t.variant_id = v.id AND v.entry_year_month = '209902';
DELETE FROM app.price_list_variants WHERE entry_year_month = '209902';
DELETE FROM app.price_list_entries WHERE year_month = '209902';

DELETE FROM app.product_process_route_version_steps
 WHERE route_version_id = 'dc040000-0000-4000-8000-000000009101'::uuid;
DELETE FROM app.product_process_route_versions WHERE route_id = 9101;
DELETE FROM app.product_process_routes WHERE id = 9101;

-- ── 1. 他社製品 ─────────────────────────────────────────────────────────────
-- 他社が作った工具。再研磨でだけ使える（製造工程リスト・製造分の指示書・
-- 本番/テスト/サンプルの明細では選べない）。メーカーは自由記入で BP にはしない。
INSERT INTO app.items (id, item_type, code, year_month, seq, name,
  unit, is_active, is_external_product, maker_name, created_at, updated_at)
VALUES (9101, 'PRODUCT'::app."ITEM_TYPE", 'PRD-209902-0001', '209902', 1,
  '{"ja": "日研 超硬エンドミル 4枚刃 φ10×75", "en": "Nikken carbide end mill 4FL φ10×75"}'::jsonb,
  '本', true, true, '日研ツール', now(), now())
ON CONFLICT (id) DO UPDATE
  SET is_external_product = true, maker_name = '日研ツール', is_active = true;

SELECT setval(pg_get_serial_sequence('app.items', 'id'),
              GREATEST((SELECT MAX(id) FROM app.items), 9101));

-- ── 2. 共通の再研磨工程リスト ───────────────────────────────────────────────
-- 製品受入（再研磨）で始まり、研磨 → 出荷前検査。item_id / customer_bp_id は
-- NULL でなければならない（CHECK product_process_routes_kind_columns）。
INSERT INTO app.product_process_routes (id, kind, item_id, customer_bp_id, name,
  is_active, notes, created_by, created_at, updated_at)
VALUES (9101, 'REGRIND'::app."PROCESS_ROUTE_KIND", NULL, NULL,
  '{"ja": "再研磨 標準", "en": "Regrind standard"}'::jsonb, true, NULL,
  'a0b1c2d3-0000-4000-8000-000000005107'::uuid, now(), now());

SELECT setval(pg_get_serial_sequence('app.product_process_routes', 'id'),
              GREATEST((SELECT MAX(id) FROM app.product_process_routes), 9101));

INSERT INTO app.product_process_route_versions (id, route_id, version, notes,
  created_by, created_at)
VALUES ('dc040000-0000-4000-8000-000000009101'::uuid, 9101, 1, NULL,
  'a0b1c2d3-0000-4000-8000-000000005107'::uuid, now());

INSERT INTO app.product_process_route_version_steps (id, route_version_id,
  process_step_id, sort_order, execution_location, plant_id, supplier_bp_id, work_hours)
VALUES
  ('dc041000-0000-4000-8000-000000009101'::uuid, 'dc040000-0000-4000-8000-000000009101'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'REGRIND_RECEIPT'), 1,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'), NULL, 0.2),
  ('dc041000-0000-4000-8000-000000009102'::uuid, 'dc040000-0000-4000-8000-000000009101'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'REGRIND_OD'), 2,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'), NULL, 1.5),
  ('dc041000-0000-4000-8000-000000009103'::uuid, 'dc040000-0000-4000-8000-000000009101'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'PRE_SHIP_INSPECTION'), 3,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'), NULL, 0.3);

-- ── 3. 確定済みの注文請書 + 再研磨の明細 ────────────────────────────────────
INSERT INTO app.order_acceptances (year_month, seq, status, source, source_file_id,
  customer_bp_id, customer_order_ref, order_date, notes, created_by, created_at, updated_at)
VALUES ('209902', 1, 'COMPLETED'::app."ORDER_ACCEPTANCE_STATUS", 'MANUAL'::app."INTAKE_SOURCE", NULL,
  'd0000000-0000-4000-8000-000000000001'::uuid, 'D-2699-0001', '2026-09-01',
  'e2e: 再研磨', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid, now(), now());

-- 確定済みなので branch / unit_price / amount / confirmed_at が揃っていること
-- （CHECK order_lines_confirmed_complete）。
INSERT INTO app.order_lines (id, acceptance_year_month, acceptance_seq, branch, sort_order,
  item_id, product_text, order_type, quantity, unit_price, amount, delivery_date,
  status, confirmed_at, delivery_method, assigned_plant_id, created_at, updated_at)
VALUES ('d6000000-0000-4000-8000-000000009101'::uuid, '209902', 1, 1, 0,
  9101, '日研 超硬エンドミル φ10 再研磨', 'REGRIND'::app."ORDER_TYPE", 10, 1500, 15000, '2026-10-01',
  'CONFIRMED'::app."ORDER_LINE_STATUS", now(), 'NORMAL'::app."DELIVERY_METHOD",
  (SELECT id FROM app.plants WHERE code = 'F01'), now(), now());

-- ── 4. 価格表（顧客 × 他社製品 — 再研磨のバリアントだけ）────────────────────
-- 他社製品の価格表は REGRIND しか持てない（保存側が拒否する）。出荷後の請求単価が
-- この価格から引かれることまで見るために置く。
INSERT INTO app.price_list_entries (year_month, seq, customer_bp_id, item_id, currency,
  is_active, created_by, created_at, updated_at)
VALUES ('209902', 1, 'd0000000-0000-4000-8000-000000000001'::uuid, 9101, 'JPY',
  true, 'a0b1c2d3-0000-4000-8000-000000005107'::uuid, now(), now());

INSERT INTO app.price_list_variants (id, entry_year_month, entry_seq, order_type,
  base_unit_price, valid_from, valid_until, is_active, created_at, updated_at)
VALUES ('d7000000-0000-4000-8000-000000009101'::uuid, '209902', 1,
  'REGRIND'::app."ORDER_TYPE", 1500, '2026-01-01', NULL, true, now(), now());

INSERT INTO app.price_list_tiers (id, variant_id, min_quantity, max_quantity,
  multiplier, price_override, sort_order)
VALUES ('d8000000-0000-4000-8000-000000009101'::uuid,
  'd7000000-0000-4000-8000-000000009101'::uuid, 1, NULL, 1.0, NULL, 0);

-- 確認用（流したときに目で見える）
SELECT 'fixture' AS tag,
  (SELECT count(*) FROM app.items WHERE id = 9101 AND is_external_product) AS external_product,
  (SELECT count(*) FROM app.product_process_route_version_steps
     WHERE route_version_id = 'dc040000-0000-4000-8000-000000009101'::uuid) AS regrind_route_steps,
  (SELECT count(*) FROM app.order_lines WHERE acceptance_year_month = '209902'
     AND order_type = 'REGRIND') AS regrind_lines,
  (SELECT count(*) FROM app.defect_types WHERE code = 'REGRIND_RETURN') AS return_defect_type;
