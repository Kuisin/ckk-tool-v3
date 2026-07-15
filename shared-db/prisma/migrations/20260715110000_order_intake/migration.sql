-- CreateEnum
CREATE TYPE "app"."INTAKE_SOURCE" AS ENUM ('FOLDER', 'UPLOAD', 'MANUAL');
-- CreateEnum
CREATE TYPE "app"."ORDER_ACCEPTANCE_STATUS" AS ENUM ('IMPORT', 'DRAFT', 'REQUESTED', 'APPROVED', 'COMPLETED', 'ARCHIVED');
-- CreateTable
CREATE TABLE "app"."order_acceptances" (
    "year_month" CHAR(6) NOT NULL,
    "seq" INTEGER NOT NULL,
    "status" "app"."ORDER_ACCEPTANCE_STATUS" NOT NULL DEFAULT 'IMPORT',
    "source" "app"."INTAKE_SOURCE" NOT NULL DEFAULT 'MANUAL',
    "source_file_id" UUID,
    "extracted" JSONB,
    "extract_error" TEXT,
    "customer_bp_id" UUID,
    "customer_branch_bp_id" UUID,
    "customer_order_ref" TEXT,
    "order_date" DATE,
    "notes" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "order_acceptances_pkey" PRIMARY KEY ("year_month","seq")
);
-- CreateTable
CREATE TABLE "app"."order_acceptance_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "acceptance_year_month" CHAR(6) NOT NULL,
    "acceptance_seq" INTEGER NOT NULL,
    "product_id" INTEGER,
    "product_text" TEXT,
    "order_type" "app"."ORDER_TYPE" NOT NULL DEFAULT 'PRODUCTION',
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2),
    "delivery_date" DATE,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "order_acceptance_items_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "order_acceptances_status_idx" ON "app"."order_acceptances"("status");
-- CreateIndex
CREATE INDEX "order_acceptance_items_acceptance_year_month_acceptance_seq_idx" ON "app"."order_acceptance_items"("acceptance_year_month", "acceptance_seq");
-- AddForeignKey
ALTER TABLE "app"."order_acceptances" ADD CONSTRAINT "order_acceptances_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "app"."files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."order_acceptances" ADD CONSTRAINT "order_acceptances_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."order_acceptances" ADD CONSTRAINT "order_acceptances_customer_branch_bp_id_fkey" FOREIGN KEY ("customer_branch_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."order_acceptances" ADD CONSTRAINT "order_acceptances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."order_acceptance_items" ADD CONSTRAINT "order_acceptance_items_acceptance_year_month_acceptance_se_fkey" FOREIGN KEY ("acceptance_year_month", "acceptance_seq") REFERENCES "app"."order_acceptances"("year_month", "seq") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."order_acceptance_items" ADD CONSTRAINT "order_acceptance_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
