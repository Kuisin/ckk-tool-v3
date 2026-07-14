-- CreateEnum
CREATE TYPE "app"."SHIPPING_TYPE" AS ENUM ('STOCK_STORAGE', 'DISPATCH');
-- CreateEnum
CREATE TYPE "app"."SHIPPING_STATUS" AS ENUM ('DRAFT', 'CONFIRMED', 'SHIPPED');
-- CreateEnum
CREATE TYPE "app"."DELIVERY_METHOD" AS ENUM ('DIRECT_TO_USER', 'NORMAL');
-- CreateEnum
CREATE TYPE "app"."DELIVERY_STATUS" AS ENUM ('DRAFT', 'ISSUED', 'DELIVERED');
-- CreateTable
CREATE TABLE "app"."shipping_orders" (
    "year_month" CHAR(6) NOT NULL,
    "seq" INTEGER NOT NULL,
    "sales_order_id" UUID NOT NULL,
    "work_order_id" UUID,
    "from_factory_id" INTEGER,
    "type" "app"."SHIPPING_TYPE" NOT NULL,
    "status" "app"."SHIPPING_STATUS" NOT NULL DEFAULT 'DRAFT',
    "shipped_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "shipping_orders_pkey" PRIMARY KEY ("year_month","seq")
);
-- CreateTable
CREATE TABLE "app"."shipping_order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shipping_order_year_month" CHAR(6) NOT NULL,
    "shipping_order_seq" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "lot_number" INTEGER,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "shipping_order_items_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."delivery_notes" (
    "year_month" CHAR(6) NOT NULL,
    "seq" INTEGER NOT NULL,
    "shipping_order_year_month" CHAR(6) NOT NULL,
    "shipping_order_seq" INTEGER NOT NULL,
    "delivery_method" "app"."DELIVERY_METHOD" NOT NULL,
    "recipient_bp_id" UUID NOT NULL,
    "recipient_branch_bp_id" UUID,
    "end_user_bp_id" UUID,
    "include_price" BOOLEAN NOT NULL DEFAULT true,
    "pdf_file_id" UUID,
    "status" "app"."DELIVERY_STATUS" NOT NULL DEFAULT 'DRAFT',
    "delivered_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "delivery_notes_pkey" PRIMARY KEY ("year_month","seq")
);
-- CreateTable
CREATE TABLE "app"."delivery_note_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "delivery_note_year_month" CHAR(6) NOT NULL,
    "delivery_note_seq" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2),
    "amount" DECIMAL(12,2),
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "delivery_note_items_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "shipping_orders_sales_order_id_idx" ON "app"."shipping_orders"("sales_order_id");
-- CreateIndex
CREATE INDEX "shipping_orders_status_idx" ON "app"."shipping_orders"("status");
-- CreateIndex
CREATE INDEX "shipping_order_items_shipping_order_year_month_shipping_ord_idx" ON "app"."shipping_order_items"("shipping_order_year_month", "shipping_order_seq");
-- CreateIndex
CREATE INDEX "delivery_notes_shipping_order_year_month_shipping_order_seq_idx" ON "app"."delivery_notes"("shipping_order_year_month", "shipping_order_seq");
-- CreateIndex
CREATE INDEX "delivery_note_items_delivery_note_year_month_delivery_note__idx" ON "app"."delivery_note_items"("delivery_note_year_month", "delivery_note_seq");
-- AddForeignKey
ALTER TABLE "app"."shipping_orders" ADD CONSTRAINT "shipping_orders_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "app"."sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."shipping_orders" ADD CONSTRAINT "shipping_orders_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "app"."work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."shipping_orders" ADD CONSTRAINT "shipping_orders_from_factory_id_fkey" FOREIGN KEY ("from_factory_id") REFERENCES "app"."factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."shipping_orders" ADD CONSTRAINT "shipping_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."shipping_order_items" ADD CONSTRAINT "shipping_order_items_shipping_order_year_month_shipping_or_fkey" FOREIGN KEY ("shipping_order_year_month", "shipping_order_seq") REFERENCES "app"."shipping_orders"("year_month", "seq") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."shipping_order_items" ADD CONSTRAINT "shipping_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."delivery_notes" ADD CONSTRAINT "delivery_notes_shipping_order_year_month_shipping_order_se_fkey" FOREIGN KEY ("shipping_order_year_month", "shipping_order_seq") REFERENCES "app"."shipping_orders"("year_month", "seq") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."delivery_notes" ADD CONSTRAINT "delivery_notes_recipient_bp_id_fkey" FOREIGN KEY ("recipient_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."delivery_notes" ADD CONSTRAINT "delivery_notes_recipient_branch_bp_id_fkey" FOREIGN KEY ("recipient_branch_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."delivery_notes" ADD CONSTRAINT "delivery_notes_end_user_bp_id_fkey" FOREIGN KEY ("end_user_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."delivery_notes" ADD CONSTRAINT "delivery_notes_pdf_file_id_fkey" FOREIGN KEY ("pdf_file_id") REFERENCES "app"."files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."delivery_notes" ADD CONSTRAINT "delivery_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."delivery_note_items" ADD CONSTRAINT "delivery_note_items_delivery_note_year_month_delivery_note_fkey" FOREIGN KEY ("delivery_note_year_month", "delivery_note_seq") REFERENCES "app"."delivery_notes"("year_month", "seq") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."delivery_note_items" ADD CONSTRAINT "delivery_note_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
