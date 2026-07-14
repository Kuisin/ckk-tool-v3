-- CreateEnum
CREATE TYPE "app"."INVOICE_STATUS" AS ENUM ('DRAFT', 'ISSUED', 'SENT', 'PAID');
-- CreateEnum
CREATE TYPE "app"."CLOSING_STATUS" AS ENUM ('PENDING', 'PROCESSED', 'EXPORTED');
-- CreateTable
CREATE TABLE "app"."invoices" (
    "year_month" CHAR(6) NOT NULL,
    "seq" INTEGER NOT NULL,
    "customer_bp_id" UUID NOT NULL,
    "customer_branch_bp_id" UUID,
    "billing_period_from" DATE NOT NULL,
    "billing_period_to" DATE NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "status" "app"."INVOICE_STATUS" NOT NULL DEFAULT 'DRAFT',
    "issued_at" TIMESTAMPTZ(6),
    "due_date" DATE,
    "sent_at" TIMESTAMPTZ(6),
    "pdf_file_id" UUID,
    "yayoi_exported_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("year_month","seq")
);
-- CreateTable
CREATE TABLE "app"."invoice_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_year_month" CHAR(6) NOT NULL,
    "invoice_seq" INTEGER NOT NULL,
    "shipping_order_year_month" CHAR(6),
    "shipping_order_seq" INTEGER,
    "delivery_note_year_month" CHAR(6),
    "delivery_note_seq" INTEGER,
    "description" JSONB NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."billing_closings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_bp_id" UUID NOT NULL,
    "closing_date" DATE NOT NULL,
    "status" "app"."CLOSING_STATUS" NOT NULL DEFAULT 'PENDING',
    "total_amount" DECIMAL(12,2),
    "invoice_year_month" CHAR(6),
    "invoice_seq" INTEGER,
    "processed_at" TIMESTAMPTZ(6),
    "processed_by" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_closings_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "invoices_customer_bp_id_idx" ON "app"."invoices"("customer_bp_id");
-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "app"."invoices"("status");
-- CreateIndex
CREATE INDEX "invoice_items_invoice_year_month_invoice_seq_idx" ON "app"."invoice_items"("invoice_year_month", "invoice_seq");
-- CreateIndex
CREATE INDEX "billing_closings_status_idx" ON "app"."billing_closings"("status");
-- CreateIndex
CREATE UNIQUE INDEX "billing_closings_customer_bp_id_closing_date_key" ON "app"."billing_closings"("customer_bp_id", "closing_date");
-- AddForeignKey
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_customer_branch_bp_id_fkey" FOREIGN KEY ("customer_branch_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_pdf_file_id_fkey" FOREIGN KEY ("pdf_file_id") REFERENCES "app"."files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."invoice_items" ADD CONSTRAINT "invoice_items_invoice_year_month_invoice_seq_fkey" FOREIGN KEY ("invoice_year_month", "invoice_seq") REFERENCES "app"."invoices"("year_month", "seq") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."billing_closings" ADD CONSTRAINT "billing_closings_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
