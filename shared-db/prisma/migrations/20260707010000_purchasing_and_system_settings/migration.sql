-- 素材発注・入荷 + system_settings (_specs/tables.md §素材発注 / §見積試算).
-- factory_id は工場マスタ導入時に追加。approvers は承認フロー導入時に追加。

-- CreateEnum
CREATE TYPE "app"."PURCHASE_STATUS" AS ENUM ('DRAFT', 'REQUESTED', 'APPROVED', 'ORDERED', 'COMPLETED', 'CANCELLED');


-- CreateTable
CREATE TABLE "app"."material_purchase_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "po_number" TEXT NOT NULL,
    "supplier_bp_id" UUID NOT NULL,
    "status" "app"."PURCHASE_STATUS" NOT NULL DEFAULT 'DRAFT',
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "purchase_date" DATE,
    "requested_at" TIMESTAMPTZ(6),
    "requested_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "ordered_at" TIMESTAMPTZ(6),
    "ordered_by" UUID,
    "completed_at" TIMESTAMPTZ(6),
    "completed_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by" UUID,
    "cancel_reason" TEXT,
    "history" JSONB,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "material_purchase_orders_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "app"."material_purchase_order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchase_order_id" UUID NOT NULL,
    "material_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "expected_at" DATE,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "material_purchase_order_items_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "app"."material_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "material_id" TEXT NOT NULL,
    "supplier_bp_id" UUID,
    "purchase_order_item_id" UUID,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "received_at" DATE NOT NULL,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_receipts_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "app"."system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);


-- CreateIndex
CREATE UNIQUE INDEX "material_purchase_orders_po_number_key" ON "app"."material_purchase_orders"("po_number");


-- CreateIndex
CREATE INDEX "material_purchase_orders_status_idx" ON "app"."material_purchase_orders"("status");


-- CreateIndex
CREATE INDEX "material_purchase_orders_supplier_bp_id_idx" ON "app"."material_purchase_orders"("supplier_bp_id");


-- CreateIndex
CREATE INDEX "material_purchase_order_items_purchase_order_id_idx" ON "app"."material_purchase_order_items"("purchase_order_id");


-- CreateIndex
CREATE INDEX "material_purchase_order_items_material_id_idx" ON "app"."material_purchase_order_items"("material_id");


-- CreateIndex
CREATE INDEX "material_receipts_material_id_received_at_idx" ON "app"."material_receipts"("material_id", "received_at");


-- AddForeignKey
ALTER TABLE "app"."material_purchase_orders" ADD CONSTRAINT "material_purchase_orders_supplier_bp_id_fkey" FOREIGN KEY ("supplier_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."material_purchase_orders" ADD CONSTRAINT "material_purchase_orders_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."material_purchase_orders" ADD CONSTRAINT "material_purchase_orders_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."material_purchase_orders" ADD CONSTRAINT "material_purchase_orders_ordered_by_fkey" FOREIGN KEY ("ordered_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."material_purchase_orders" ADD CONSTRAINT "material_purchase_orders_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."material_purchase_orders" ADD CONSTRAINT "material_purchase_orders_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."material_purchase_orders" ADD CONSTRAINT "material_purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."material_purchase_order_items" ADD CONSTRAINT "material_purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "app"."material_purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."material_purchase_order_items" ADD CONSTRAINT "material_purchase_order_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "app"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."material_receipts" ADD CONSTRAINT "material_receipts_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "app"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."material_receipts" ADD CONSTRAINT "material_receipts_supplier_bp_id_fkey" FOREIGN KEY ("supplier_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."material_receipts" ADD CONSTRAINT "material_receipts_purchase_order_item_id_fkey" FOREIGN KEY ("purchase_order_item_id") REFERENCES "app"."material_purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."material_receipts" ADD CONSTRAINT "material_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."system_settings" ADD CONSTRAINT "system_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 試算価格ポリシーの既定値（冪等）─────────────────────────────────

INSERT INTO "app"."system_settings" ("key", "value", "description", "updated_at") VALUES
  ('trial_pricing.material_price_basis', '"MAX"', '材料参照価格の算出方法（MAX/LATEST/AVERAGE）', now()),
  ('trial_pricing.lookback_months', '6', '仕入実績の参照期間（月）', now()),
  ('trial_pricing.machining_rate_per_10min', '2000', '加工単価（¥/10分）', now()),
  ('trial_pricing.spare_shape_count', '3', '予備本数', now()),
  ('trial_pricing.correction_factor', '1.25', '補正値', now()),
  ('trial_pricing.ld_charge_per_10min', '7500', 'LD加算（¥/10分）', now())
ON CONFLICT ("key") DO NOTHING;
