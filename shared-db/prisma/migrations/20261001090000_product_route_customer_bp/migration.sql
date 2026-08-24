-- 製品工程ルートに対象の受注元（取引先）を追加。null = 汎用ルート（従来どおり）。
-- 指示書ビルダーは顧客一致ルートを優先し、無ければ汎用へフォールバックする。

-- AlterTable
ALTER TABLE "app"."product_process_routes" ADD COLUMN     "customer_bp_id" UUID;

-- CreateIndex
CREATE INDEX "product_process_routes_product_id_customer_bp_id_idx" ON "app"."product_process_routes"("product_id", "customer_bp_id");

-- AddForeignKey
ALTER TABLE "app"."product_process_routes" ADD CONSTRAINT "product_process_routes_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
