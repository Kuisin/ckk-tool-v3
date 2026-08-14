-- 在庫向けの独立指示書（注文請書なし）対応:
--   1. work_orders.sales_order_id を nullable 化（null = 在庫向け独立指示書。
--      在庫分 FROM_STOCK と顧客注文分は引き続き注文請書配下）
--   2. work_orders.product_id を追加（常に保持 — SO 配下は SO の製品を
--      backfill、以後はアプリが常に書き込む）

-- AlterTable: sales_order_id nullable 化
ALTER TABLE "app"."work_orders" ALTER COLUMN "sales_order_id" DROP NOT NULL;

-- AlterTable: product_id 追加 → 既存行を注文請書の製品で backfill → NOT NULL 化
ALTER TABLE "app"."work_orders" ADD COLUMN "product_id" INTEGER;

UPDATE "app"."work_orders" wo
SET "product_id" = so."product_id"
FROM "app"."sales_orders" so
WHERE wo."sales_order_id" = so."id";

ALTER TABLE "app"."work_orders" ALTER COLUMN "product_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "work_orders_product_id_idx" ON "app"."work_orders"("product_id");

-- AddForeignKey
ALTER TABLE "app"."work_orders" ADD CONSTRAINT "work_orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
