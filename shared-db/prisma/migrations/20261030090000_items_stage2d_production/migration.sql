-- 品目統合 第 2 段 D — 生産・設計の製品参照を品目へ付け替える。
--
-- 製品を指していた 5 つの列に品目の列を並べて足し、products.item_id をたどって
-- 埋める。**旧列 product_id は残す** — 落とすのは最後の PR。
--
--   work_orders.product_id               → product_item_id（作る製品）
--   product_process_routes.product_id    → item_id
--   inspection_templates.product_id      → item_id
--   design_requests.product_id           → item_id
--   design_files.product_id              → item_id
--
-- 指示書だけ列名が product_item_id なのは、**品目を 2 つ指す**から
-- （作る製品と、第 2 段 B で足した material_item_id = 使う素材）。

-- AlterTable
ALTER TABLE "app"."work_orders"            ADD COLUMN "product_item_id" INTEGER;
ALTER TABLE "app"."product_process_routes" ADD COLUMN "item_id" INTEGER;
ALTER TABLE "app"."inspection_templates"   ADD COLUMN "item_id" INTEGER;
ALTER TABLE "app"."design_requests"        ADD COLUMN "item_id" INTEGER;
ALTER TABLE "app"."design_files"           ADD COLUMN "item_id" INTEGER;

-- 既存行を埋める（製品 → 品目）
UPDATE "app"."work_orders" t
  SET product_item_id = p.item_id FROM "app"."products" p WHERE p.id = t.product_id;
UPDATE "app"."product_process_routes" t
  SET item_id = p.item_id FROM "app"."products" p WHERE p.id = t.product_id;
UPDATE "app"."inspection_templates" t
  SET item_id = p.item_id FROM "app"."products" p WHERE p.id = t.product_id;
UPDATE "app"."design_requests" t
  SET item_id = p.item_id FROM "app"."products" p WHERE p.id = t.product_id;
UPDATE "app"."design_files" t
  SET item_id = p.item_id FROM "app"."products" p WHERE p.id = t.product_id;

-- CreateIndex
CREATE INDEX "work_orders_product_item_id_idx"       ON "app"."work_orders"("product_item_id");
CREATE INDEX "product_process_routes_item_id_idx"    ON "app"."product_process_routes"("item_id");
CREATE INDEX "inspection_templates_item_id_idx"      ON "app"."inspection_templates"("item_id");
CREATE INDEX "design_requests_item_id_idx"           ON "app"."design_requests"("item_id");
CREATE INDEX "design_files_item_id_idx"              ON "app"."design_files"("item_id");

-- AddForeignKey
ALTER TABLE "app"."work_orders"            ADD CONSTRAINT "work_orders_product_item_id_fkey"       FOREIGN KEY ("product_item_id") REFERENCES "app"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."product_process_routes" ADD CONSTRAINT "product_process_routes_item_id_fkey"    FOREIGN KEY ("item_id")         REFERENCES "app"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."inspection_templates"   ADD CONSTRAINT "inspection_templates_item_id_fkey"      FOREIGN KEY ("item_id")         REFERENCES "app"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."design_requests"        ADD CONSTRAINT "design_requests_item_id_fkey"           FOREIGN KEY ("item_id")         REFERENCES "app"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."design_files"           ADD CONSTRAINT "design_files_item_id_fkey"              FOREIGN KEY ("item_id")         REFERENCES "app"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 埋め残しがあれば止める
DO $$
DECLARE n int;
BEGIN
  SELECT
    (SELECT count(*) FROM app.work_orders            WHERE product_id IS NOT NULL AND product_item_id IS NULL)
  + (SELECT count(*) FROM app.product_process_routes WHERE product_id IS NOT NULL AND item_id IS NULL)
  + (SELECT count(*) FROM app.inspection_templates   WHERE product_id IS NOT NULL AND item_id IS NULL)
  + (SELECT count(*) FROM app.design_requests        WHERE product_id IS NOT NULL AND item_id IS NULL)
  + (SELECT count(*) FROM app.design_files           WHERE product_id IS NOT NULL AND item_id IS NULL)
  INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'stage2d: product_id はあるのに品目が埋まらなかった行が % 件', n;
  END IF;
END $$;
