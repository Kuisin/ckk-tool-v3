-- 指示書 ↔ 注文明細の割当（m:n）+ 注文請書ヘッダ項目 + 指示書の保管場所。
--
-- 1) work_order_order_lines: 分割（1 明細 → 複数指示書で部分手配）と統合
--    （同一製品の複数明細 → 1 指示書 = 1 ロット）の両方を許す割当表。
--    quantity = その指示書がその明細のために充当する数量。既存の
--    work_orders.order_line_id は割当 1 件として移行してから列ごと落とす
--    （充当数は明細数量を超えない範囲の予定数量 — 不良予備分は割当に含めない）。
-- 2) order_lines.lot_number: 統合ロットでは複数明細が同じロット番号（= 指示書
--    番号）を共有するため unique を通常 index に変える。
-- 3) order_acceptances: 出荷先 (ship_to_bp_id) / 担当拠点 (assigned_plant_id) /
--    出荷作業場所 (shipping_work_location_id — 作業場所マスタ MS0D) を追加。
-- 4) work_orders.storage_location_id: 完成品の保管場所（保管場所マスタ MS0E）。

-- 1) 割当表
CREATE TABLE "app"."work_order_order_lines" (
  "work_order_id" UUID NOT NULL,
  "order_line_id" UUID NOT NULL,
  "quantity"      INTEGER NOT NULL,
  "sort_order"    INTEGER NOT NULL DEFAULT 0,
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "work_order_order_lines_pkey" PRIMARY KEY ("work_order_id", "order_line_id")
);

CREATE INDEX "work_order_order_lines_order_line_id_idx"
  ON "app"."work_order_order_lines"("order_line_id");

ALTER TABLE "app"."work_order_order_lines"
  ADD CONSTRAINT "work_order_order_lines_work_order_id_fkey" FOREIGN KEY ("work_order_id")
  REFERENCES "app"."work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."work_order_order_lines"
  ADD CONSTRAINT "work_order_order_lines_order_line_id_fkey" FOREIGN KEY ("order_line_id")
  REFERENCES "app"."order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 既存の単一リンクを割当 1 件として移行
INSERT INTO "app"."work_order_order_lines" ("work_order_id", "order_line_id", "quantity")
SELECT w."id", w."order_line_id", LEAST(w."planned_quantity", ol."quantity")
FROM "app"."work_orders" w
JOIN "app"."order_lines" ol ON ol."id" = w."order_line_id"
WHERE w."order_line_id" IS NOT NULL;

ALTER TABLE "app"."work_orders" DROP CONSTRAINT "work_orders_order_line_id_fkey";
DROP INDEX "app"."work_orders_order_line_id_idx";
ALTER TABLE "app"."work_orders" DROP COLUMN "order_line_id";

-- 2) ロット番号の unique を外す（統合ロットで共有されるため）
DROP INDEX "app"."order_lines_lot_number_key";
CREATE INDEX "order_lines_lot_number_idx" ON "app"."order_lines"("lot_number");

-- 3) 注文請書ヘッダ: 出荷先 / 担当拠点 / 出荷作業場所
ALTER TABLE "app"."order_acceptances"
  ADD COLUMN "ship_to_bp_id" UUID,
  ADD COLUMN "assigned_plant_id" INTEGER,
  ADD COLUMN "shipping_work_location_id" INTEGER;

ALTER TABLE "app"."order_acceptances"
  ADD CONSTRAINT "order_acceptances_ship_to_bp_id_fkey" FOREIGN KEY ("ship_to_bp_id")
  REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."order_acceptances"
  ADD CONSTRAINT "order_acceptances_assigned_plant_id_fkey" FOREIGN KEY ("assigned_plant_id")
  REFERENCES "app"."plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."order_acceptances"
  ADD CONSTRAINT "order_acceptances_shipping_work_location_id_fkey" FOREIGN KEY ("shipping_work_location_id")
  REFERENCES "app"."work_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4) 指示書: 完成品の保管場所
ALTER TABLE "app"."work_orders" ADD COLUMN "storage_location_id" INTEGER;

CREATE INDEX "work_orders_storage_location_id_idx"
  ON "app"."work_orders"("storage_location_id");

ALTER TABLE "app"."work_orders"
  ADD CONSTRAINT "work_orders_storage_location_id_fkey" FOREIGN KEY ("storage_location_id")
  REFERENCES "app"."storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
