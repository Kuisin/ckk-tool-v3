-- work-order-marking-print の準備（この 1 本の DB にだけ流す）。
--
-- シードのまま使うもの:
--   #9001 → 注文明細 ORD-…-01（基番 200000・受注 150 本。うち 50 本をこの指示書に割当）
--   #9002 → 注文明細 ORD-…-02（基番 200001・受注 100 本）
-- 足すもの:
--   #9002 の注文明細の受注数量を 1200 本に（枝番の桁が数量に合わせて 4 桁へ広がることを見る）
--   #9101 注文明細の割当が無い指示書（在庫向け）→ 印字番号は出ない
BEGIN;

UPDATE app.order_lines SET quantity = 1200 WHERE id = 'e0000000-0000-4000-8000-000000000002';

INSERT INTO app.work_orders (id, work_order_number, product_item_id, type, planned_quantity,
  status, approval_status, approved_at, approved_by, created_by, created_at, updated_at)
VALUES
  ('dc000000-0000-4000-8000-000000009101', 9101, 9002, 'MANUFACTURE', 30,
   'APPROVED', 'APPROVED', now(), '00000000-0000-0000-0000-000000000000',
   'a0b1c2d3-0000-4000-8000-000000005107', now(), now());

INSERT INTO app.work_order_steps (id, work_order_id, process_step_id, sort_order,
  execution_location, plant_id, planned_work_hours, status)
VALUES
  ('dc091010-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000009101',
   (SELECT id FROM app.process_step_catalog WHERE code = 'CUTTING'), 1, 'INTERNAL',
   (SELECT id FROM app.plants WHERE code = 'F01'), 1, 'PENDING');

COMMIT;
