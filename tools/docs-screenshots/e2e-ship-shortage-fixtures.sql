-- e2e-ship-shortage-fixtures.sql — 「在庫が足りないまま出荷する」確認ダイアログの
-- 通し確認（e2e-ship-shortage.ts）のための状態を作る。
--
-- デモシードには**在庫の足りない確定済みの出荷書が無い**（あるのは在庫が足りる
-- DOR-202607-00002 だけ）。見たいのはまさに足りないときの挙動なので、ここで
-- 1 通だけ作る:
--
--   DOR-209901-00001 … 品目 9003（超硬リーマ）× ロット 9999 × 4 本。
--   **ロット 9999 のバケットは存在しない** — 利用者が dev で踏んだ形
--   （「品目 … に在庫台帳がありません」）と同じ。
--
-- 何度流しても同じ結果になるよう、先に消してから作る。
DELETE FROM app.inventory_transactions t
 USING app.inventory_movements m
 WHERE t.movement_id = m.id AND m.source_id = 'DOR-209901-00001';
DELETE FROM app.inventory_movements WHERE source_id = 'DOR-209901-00001';
DELETE FROM app.item_inventory WHERE item_id = 9003 AND lot_number = 9999;
DELETE FROM app.delivery_order_items
 WHERE delivery_order_year_month = '209901' AND delivery_order_seq = 1;
DELETE FROM app.delivery_orders WHERE year_month = '209901' AND seq = 1;

INSERT INTO app.delivery_orders (year_month, seq, customer_bp_id, work_order_id, from_plant_id,
  type, status, shipped_at, notes, created_by, created_at, updated_at)
VALUES ('209901', 1, 'd0000000-0000-4000-8000-000000000001'::uuid, NULL,
  (SELECT id FROM app.plants WHERE code = 'F01'),
  'DISPATCH'::app."DELIVERY_ORDER_TYPE", 'CONFIRMED'::app."DELIVERY_ORDER_STATUS",
  NULL, 'e2e: 在庫不足の出荷',
  'a0b1c2d3-0000-4000-8000-000000005107'::uuid, now(), now());

-- 注文明細には紐づけない（在庫向けの出荷。過不足の判定を巻き込まずに、
-- 在庫が足りないことだけを見たいため）。
INSERT INTO app.delivery_order_items (id, delivery_order_year_month, delivery_order_seq,
  order_line_id, item_id, lot_number, quantity, notes, sort_order)
VALUES ('dd000000-0000-4000-8000-0000000099e1'::uuid, '209901', 1,
  NULL, 9003, 9999, 4, NULL, 0);

-- 確認用（流したときに目で見える）
SELECT 'fixture' AS tag,
       (SELECT count(*) FROM app.delivery_orders WHERE year_month='209901') AS orders,
       (SELECT count(*) FROM app.item_inventory WHERE item_id=9003 AND lot_number=9999) AS buckets_for_lot;
