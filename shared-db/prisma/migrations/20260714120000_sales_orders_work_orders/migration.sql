-- CreateEnum
CREATE TYPE "app"."SALES_ORDER_STATUS" AS ENUM ('DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'PARTIAL_SHIPPED', 'SHIPPED', 'CANCELLED');
-- CreateEnum
CREATE TYPE "app"."WORK_ORDER_TYPE" AS ENUM ('FROM_STOCK', 'MANUFACTURE');
-- CreateEnum
CREATE TYPE "app"."WORK_ORDER_STATUS" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
-- CreateEnum
CREATE TYPE "app"."WORK_ORDER_APPROVAL_STATUS" AS ENUM ('NONE', 'PENDING_1ST', 'APPROVED_1ST', 'PENDING_2ND', 'APPROVED', 'REJECTED');
-- CreateEnum
CREATE TYPE "app"."STEP_EXECUTION" AS ENUM ('INTERNAL', 'OUTSOURCE');
-- CreateEnum
CREATE TYPE "app"."STEP_STATUS" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
-- CreateTable
CREATE TABLE "app"."sales_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "year_month" CHAR(6) NOT NULL,
    "seq" INTEGER NOT NULL,
    "branch" INTEGER NOT NULL DEFAULT 1,
    "customer_bp_id" UUID NOT NULL,
    "customer_branch_bp_id" UUID,
    "end_user_bp_id" UUID,
    "customer_order_ref" TEXT,
    "quote_year_month" CHAR(6),
    "quote_seq" INTEGER,
    "product_id" INTEGER NOT NULL,
    "lot_number" INTEGER,
    "order_type" "app"."ORDER_TYPE" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "delivery_date" DATE,
    "status" "app"."SALES_ORDER_STATUS" NOT NULL DEFAULT 'DRAFT',
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."work_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_number" INTEGER NOT NULL,
    "sales_order_id" UUID NOT NULL,
    "type" "app"."WORK_ORDER_TYPE" NOT NULL,
    "planned_quantity" INTEGER NOT NULL,
    "material_id" INTEGER,
    "status" "app"."WORK_ORDER_STATUS" NOT NULL DEFAULT 'DRAFT',
    "approval_status" "app"."WORK_ORDER_APPROVAL_STATUS" NOT NULL DEFAULT 'NONE',
    "source_work_order_id" UUID,
    "requested_1st_at" TIMESTAMPTZ(6),
    "requested_1st_by" UUID,
    "approved_1st_at" TIMESTAMPTZ(6),
    "approved_1st_by" UUID,
    "approved_2nd_at" TIMESTAMPTZ(6),
    "approved_2nd_by" UUID,
    "rejected_at" TIMESTAMPTZ(6),
    "rejected_by" UUID,
    "reject_reason" TEXT,
    "history" JSONB,
    "approved_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."work_order_inspection_templates" (
    "work_order_id" UUID NOT NULL,
    "inspection_template_id" INTEGER NOT NULL,
    CONSTRAINT "work_order_inspection_templates_pkey" PRIMARY KEY ("work_order_id","inspection_template_id")
);
-- CreateTable
CREATE TABLE "app"."work_order_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL,
    "process_step_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "execution_location" "app"."STEP_EXECUTION" NOT NULL,
    "factory_id" INTEGER,
    "supplier_bp_id" UUID,
    "outsource_requested_at" DATE,
    "outsource_expected_at" DATE,
    "outsource_received_at" DATE,
    "status" "app"."STEP_STATUS" NOT NULL DEFAULT 'PENDING',
    "input_quantity" INTEGER,
    "output_success_quantity" INTEGER,
    "output_defect_semi_finished" INTEGER,
    "output_defect_scrap" INTEGER,
    "output_defect_rework" INTEGER,
    "session_locked_by" UUID,
    "session_locked_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "started_by" UUID,
    "completed_at" TIMESTAMPTZ(6),
    "completed_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by" UUID,
    "cancel_reason" TEXT,
    "notes" TEXT,
    CONSTRAINT "work_order_steps_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."work_order_step_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL,
    "source_step_id" UUID NOT NULL,
    "target_step_id" UUID NOT NULL,
    "routed_quantity" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_order_step_links_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_lot_number_key" ON "app"."sales_orders"("lot_number");
-- CreateIndex
CREATE INDEX "sales_orders_customer_bp_id_idx" ON "app"."sales_orders"("customer_bp_id");
-- CreateIndex
CREATE INDEX "sales_orders_status_idx" ON "app"."sales_orders"("status");
-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_year_month_seq_branch_key" ON "app"."sales_orders"("year_month", "seq", "branch");
-- CreateIndex
CREATE UNIQUE INDEX "work_orders_work_order_number_key" ON "app"."work_orders"("work_order_number");
-- CreateIndex
CREATE INDEX "work_orders_sales_order_id_idx" ON "app"."work_orders"("sales_order_id");
-- CreateIndex
CREATE INDEX "work_orders_status_idx" ON "app"."work_orders"("status");
-- CreateIndex
CREATE INDEX "work_orders_approval_status_idx" ON "app"."work_orders"("approval_status");
-- CreateIndex
CREATE INDEX "work_order_steps_work_order_id_sort_order_idx" ON "app"."work_order_steps"("work_order_id", "sort_order");
-- CreateIndex
CREATE INDEX "work_order_steps_status_idx" ON "app"."work_order_steps"("status");
-- CreateIndex
CREATE UNIQUE INDEX "work_order_step_links_source_step_id_target_step_id_key" ON "app"."work_order_step_links"("source_step_id", "target_step_id");
-- AddForeignKey
ALTER TABLE "app"."sales_orders" ADD CONSTRAINT "sales_orders_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."sales_orders" ADD CONSTRAINT "sales_orders_customer_branch_bp_id_fkey" FOREIGN KEY ("customer_branch_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."sales_orders" ADD CONSTRAINT "sales_orders_end_user_bp_id_fkey" FOREIGN KEY ("end_user_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."sales_orders" ADD CONSTRAINT "sales_orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."sales_orders" ADD CONSTRAINT "sales_orders_quote_year_month_quote_seq_fkey" FOREIGN KEY ("quote_year_month", "quote_seq") REFERENCES "app"."quotes"("year_month", "seq") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."sales_orders" ADD CONSTRAINT "sales_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."work_orders" ADD CONSTRAINT "work_orders_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "app"."sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."work_orders" ADD CONSTRAINT "work_orders_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "app"."materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."work_orders" ADD CONSTRAINT "work_orders_source_work_order_id_fkey" FOREIGN KEY ("source_work_order_id") REFERENCES "app"."work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."work_orders" ADD CONSTRAINT "work_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."work_order_inspection_templates" ADD CONSTRAINT "work_order_inspection_templates_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "app"."work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."work_order_inspection_templates" ADD CONSTRAINT "work_order_inspection_templates_inspection_template_id_fkey" FOREIGN KEY ("inspection_template_id") REFERENCES "app"."inspection_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."work_order_steps" ADD CONSTRAINT "work_order_steps_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "app"."work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."work_order_steps" ADD CONSTRAINT "work_order_steps_process_step_id_fkey" FOREIGN KEY ("process_step_id") REFERENCES "app"."process_step_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."work_order_steps" ADD CONSTRAINT "work_order_steps_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "app"."factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."work_order_steps" ADD CONSTRAINT "work_order_steps_supplier_bp_id_fkey" FOREIGN KEY ("supplier_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."work_order_step_links" ADD CONSTRAINT "work_order_step_links_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "app"."work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."work_order_step_links" ADD CONSTRAINT "work_order_step_links_source_step_id_fkey" FOREIGN KEY ("source_step_id") REFERENCES "app"."work_order_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."work_order_step_links" ADD CONSTRAINT "work_order_step_links_target_step_id_fkey" FOREIGN KEY ("target_step_id") REFERENCES "app"."work_order_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
