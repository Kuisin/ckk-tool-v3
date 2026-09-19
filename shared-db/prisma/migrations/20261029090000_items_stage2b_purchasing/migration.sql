-- 品目統合 第 2 段 B — 購買まわりの参照を品目へ付け替える。
--
-- 素材を指していた 4 つの列に item_id を並べて足し、materials.item_id をたどって
-- 埋める。アプリはこの PR で item_id を使うようになる。**旧列 material_id は
-- 残す** — 落とすのは最後の PR（切り替えが行き渡ってから順番に実行する）。
--
-- 対象:
--   material_purchase_order_items.material_id  発注明細
--   material_receipts.material_id              入荷
--   purchase_request_items.material_id         購買依頼明細
--   work_orders.material_id                    指示書が使う素材 → material_item_id
--
-- 指示書だけ列名が material_item_id なのは、**品目を 2 つ指す**から —
-- 作るもの（product_item_id、第 2 段 D で足す）と使うもの。裸の item_id に
-- すると、あとから足すほうと区別が付かない。

-- AlterTable
ALTER TABLE "app"."material_purchase_order_items" ADD COLUMN "item_id" INTEGER;
ALTER TABLE "app"."material_receipts"             ADD COLUMN "item_id" INTEGER;
ALTER TABLE "app"."purchase_request_items"        ADD COLUMN "item_id" INTEGER;
ALTER TABLE "app"."work_orders"                   ADD COLUMN "material_item_id" INTEGER;

-- 既存行を埋める（素材 → 品目）
UPDATE "app"."material_purchase_order_items" t
  SET item_id = m.item_id FROM "app"."materials" m WHERE m.id = t.material_id;
UPDATE "app"."material_receipts" t
  SET item_id = m.item_id FROM "app"."materials" m WHERE m.id = t.material_id;
UPDATE "app"."purchase_request_items" t
  SET item_id = m.item_id FROM "app"."materials" m WHERE m.id = t.material_id;
UPDATE "app"."work_orders" t
  SET material_item_id = m.item_id FROM "app"."materials" m WHERE m.id = t.material_id;

-- CreateIndex
CREATE INDEX "material_purchase_order_items_item_id_idx" ON "app"."material_purchase_order_items"("item_id");
CREATE INDEX "material_receipts_item_id_idx"             ON "app"."material_receipts"("item_id");
CREATE INDEX "purchase_request_items_item_id_idx"        ON "app"."purchase_request_items"("item_id");
CREATE INDEX "work_orders_material_item_id_idx"          ON "app"."work_orders"("material_item_id");

-- AddForeignKey
ALTER TABLE "app"."material_purchase_order_items" ADD CONSTRAINT "material_purchase_order_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "app"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."material_receipts"             ADD CONSTRAINT "material_receipts_item_id_fkey"             FOREIGN KEY ("item_id") REFERENCES "app"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."purchase_request_items"        ADD CONSTRAINT "purchase_request_items_item_id_fkey"        FOREIGN KEY ("item_id") REFERENCES "app"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."work_orders"                   ADD CONSTRAINT "work_orders_material_item_id_fkey"          FOREIGN KEY ("material_item_id") REFERENCES "app"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 埋め残しがあれば止める（素材を指しているのに品目が無い行は、統合が壊れている印）
DO $$
DECLARE n int;
BEGIN
  SELECT
    (SELECT count(*) FROM app.material_purchase_order_items WHERE material_id IS NOT NULL AND item_id IS NULL)
  + (SELECT count(*) FROM app.material_receipts             WHERE material_id IS NOT NULL AND item_id IS NULL)
  + (SELECT count(*) FROM app.purchase_request_items        WHERE material_id IS NOT NULL AND item_id IS NULL)
  + (SELECT count(*) FROM app.work_orders                   WHERE material_id IS NOT NULL AND material_item_id IS NULL)
  INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'stage2b: material_id はあるのに item_id が埋まらなかった行が % 件', n;
  END IF;
END $$;
