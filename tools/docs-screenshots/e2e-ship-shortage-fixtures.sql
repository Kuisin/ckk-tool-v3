-- e2e-ship-shortage-fixtures.sql — 「在庫が足りないまま出荷する」確認ダイアログの
-- 通し確認（e2e-ship-shortage.ts）のための状態を作る。
--
-- デモシードには**在庫の足りない確定済みの出荷書が無い**（あるのは在庫が足りる
-- DOR-202607-00002 だけ）。見たいのはまさに足りないときの挙動なので、ここで
-- 1 通だけ作る:
--
--   旧番号 DOR-209901-00001 … 品目 9003（超硬リーマ）× ロット 9999 × 4 本。
--   **画面に出る番号は DB が振る**（`DOR-2026-000NN` — 流した順で変わる）。
--   ここで入れる (year_month, seq) は旧番号（legacy_number）として残り、
--   旧番号の URL（/shipping/delivery-orders/DOR-209901-00001）は正規の URL へ
--   送られる。DB から引くときは legacy_number か app.to_doc_ref() を使う。
--   **ロット 9999 のバケットは存在しない** — 利用者が dev で踏んだ形
--   （「品目 … に在庫台帳がありません」）と同じ。
--
-- 何度流しても同じ結果になるよう、先に消してから作る。
-- 伝票の source_id は**新しい参照**（doc_ref = `CKK/DOR-2026-000NN`）。旧番号の
-- 文字列では当たらないので、出荷書を旧番号で探してその doc_ref で引く。
DELETE FROM app.inventory_transactions t
 USING app.inventory_movements m, app.delivery_orders o
 WHERE t.movement_id = m.id
   AND m.source_type = 'delivery_orders'
   AND m.source_id = o.doc_ref
   AND o.legacy_number = 'DOR-209901-00001';
DELETE FROM app.inventory_movements m
 USING app.delivery_orders o
 WHERE m.source_type = 'delivery_orders'
   AND m.source_id = o.doc_ref
   AND o.legacy_number = 'DOR-209901-00001';
DELETE FROM app.item_inventory WHERE item_id = 9003 AND lot_number = 9999;
-- 出荷で起きる納品書があれば先に消す（出荷書への FK が RESTRICT）。
DELETE FROM app.delivery_notes n
 USING app.delivery_orders o
 WHERE n.delivery_order_id = o.id AND o.legacy_number = 'DOR-209901-00001';
DELETE FROM app.delivery_order_items i
 USING app.delivery_orders o
 WHERE i.delivery_order_id = o.id AND o.legacy_number = 'DOR-209901-00001';
DELETE FROM app.delivery_orders WHERE legacy_number = 'DOR-209901-00001';

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
       (SELECT count(*) FROM app.delivery_orders WHERE legacy_number='DOR-209901-00001') AS orders,
       (SELECT doc_number FROM app.delivery_orders WHERE legacy_number='DOR-209901-00001') AS shown_as,
       (SELECT count(*) FROM app.item_inventory WHERE item_id=9003 AND lot_number=9999) AS buckets_for_lot;
