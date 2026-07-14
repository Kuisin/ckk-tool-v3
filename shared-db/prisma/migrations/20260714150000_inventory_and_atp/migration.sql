-- CreateEnum
CREATE TYPE "app"."INVENTORY_TYPE" AS ENUM ('PRODUCT', 'MATERIAL');
-- CreateEnum
CREATE TYPE "app"."RESERVATION_STATUS" AS ENUM ('RESERVED', 'CONFIRMED', 'RELEASED');
-- CreateEnum
CREATE TYPE "app"."TRANSACTION_TYPE" AS ENUM ('IN', 'OUT', 'RESERVE', 'RELEASE', 'ADJUST');
-- AlterTable
ALTER TABLE "app"."material_purchase_order_items" ADD COLUMN     "factory_id" INTEGER;
-- AlterTable
ALTER TABLE "app"."material_receipts" ADD COLUMN     "factory_id" INTEGER;
-- CreateTable
CREATE TABLE "app"."product_inventory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" INTEGER NOT NULL,
    "factory_id" INTEGER,
    "lot_number" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
    "is_semi_finished" BOOLEAN NOT NULL DEFAULT false,
    "source_step_id" UUID,
    "location" TEXT,
    "notes" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "product_inventory_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."material_inventory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "material_id" INTEGER NOT NULL,
    "factory_id" INTEGER,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reserved_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "material_inventory_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."inventory_reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inventory_type" "app"."INVENTORY_TYPE" NOT NULL,
    "inventory_id" UUID NOT NULL,
    "sales_order_id" UUID,
    "work_order_id" UUID,
    "quantity" DECIMAL(12,3) NOT NULL,
    "status" "app"."RESERVATION_STATUS" NOT NULL DEFAULT 'RESERVED',
    "reserved_at" TIMESTAMPTZ(6),
    "confirmed_at" TIMESTAMPTZ(6),
    "released_at" TIMESTAMPTZ(6),
    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."inventory_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inventory_type" "app"."INVENTORY_TYPE" NOT NULL,
    "inventory_id" UUID NOT NULL,
    "transaction_type" "app"."TRANSACTION_TYPE" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "product_inventory_product_id_idx" ON "app"."product_inventory"("product_id");
-- CreateIndex
CREATE UNIQUE INDEX "product_inventory_product_id_factory_id_lot_number_is_semi__key" ON "app"."product_inventory"("product_id", "factory_id", "lot_number", "is_semi_finished");
-- CreateIndex
CREATE INDEX "material_inventory_material_id_idx" ON "app"."material_inventory"("material_id");
-- CreateIndex
CREATE UNIQUE INDEX "material_inventory_material_id_factory_id_key" ON "app"."material_inventory"("material_id", "factory_id");
-- CreateIndex
CREATE INDEX "inventory_reservations_inventory_type_inventory_id_status_idx" ON "app"."inventory_reservations"("inventory_type", "inventory_id", "status");
-- CreateIndex
CREATE INDEX "inventory_reservations_sales_order_id_idx" ON "app"."inventory_reservations"("sales_order_id");
-- CreateIndex
CREATE INDEX "inventory_transactions_inventory_type_inventory_id_created__idx" ON "app"."inventory_transactions"("inventory_type", "inventory_id", "created_at");
-- AddForeignKey
ALTER TABLE "app"."product_inventory" ADD CONSTRAINT "product_inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."product_inventory" ADD CONSTRAINT "product_inventory_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "app"."factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."material_inventory" ADD CONSTRAINT "material_inventory_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "app"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."material_inventory" ADD CONSTRAINT "material_inventory_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "app"."factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."inventory_reservations" ADD CONSTRAINT "inventory_reservations_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "app"."sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."inventory_reservations" ADD CONSTRAINT "inventory_reservations_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "app"."work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."material_purchase_order_items" ADD CONSTRAINT "material_purchase_order_items_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "app"."factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."material_receipts" ADD CONSTRAINT "material_receipts_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "app"."factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
