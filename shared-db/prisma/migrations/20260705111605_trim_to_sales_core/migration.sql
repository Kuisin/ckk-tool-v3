-- CreateEnum
CREATE TYPE "sales"."ESTIMATE_STATUS" AS ENUM ('DRAFT', 'CONFIRMED', 'REGISTERED');

-- DropForeignKey
ALTER TABLE "billing"."invoices" DROP CONSTRAINT "invoices_customer_bp_id_fkey";

-- DropForeignKey
ALTER TABLE "billing"."invoices" DROP CONSTRAINT "invoices_customer_branch_bp_id_fkey";

-- DropForeignKey
ALTER TABLE "billing"."invoices" DROP CONSTRAINT "invoices_pdf_file_id_fkey";

-- DropForeignKey
ALTER TABLE "billing"."invoices" DROP CONSTRAINT "invoices_created_by_fkey";

-- DropForeignKey
ALTER TABLE "billing"."invoice_items" DROP CONSTRAINT "invoice_items_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "billing"."invoice_items" DROP CONSTRAINT "invoice_items_shipping_order_id_fkey";

-- DropForeignKey
ALTER TABLE "billing"."invoice_items" DROP CONSTRAINT "invoice_items_delivery_note_id_fkey";

-- DropForeignKey
ALTER TABLE "billing"."billing_closings" DROP CONSTRAINT "billing_closings_customer_bp_id_fkey";

-- DropForeignKey
ALTER TABLE "billing"."billing_closings" DROP CONSTRAINT "billing_closings_processed_by_fkey";

-- DropForeignKey
ALTER TABLE "bp"."bp_vendor_attrs" DROP CONSTRAINT "bp_vendor_attrs_bp_id_fkey";

-- DropForeignKey
ALTER TABLE "bp"."bp_end_user_attrs" DROP CONSTRAINT "bp_end_user_attrs_bp_id_fkey";

-- DropForeignKey
ALTER TABLE "design"."design_requests" DROP CONSTRAINT "design_requests_quote_id_fkey";

-- DropForeignKey
ALTER TABLE "design"."design_requests" DROP CONSTRAINT "design_requests_sales_order_id_fkey";

-- DropForeignKey
ALTER TABLE "design"."design_requests" DROP CONSTRAINT "design_requests_product_id_fkey";

-- DropForeignKey
ALTER TABLE "design"."design_requests" DROP CONSTRAINT "design_requests_created_by_fkey";

-- DropForeignKey
ALTER TABLE "design"."design_files" DROP CONSTRAINT "design_files_design_request_id_fkey";

-- DropForeignKey
ALTER TABLE "design"."design_files" DROP CONSTRAINT "design_files_product_id_fkey";

-- DropForeignKey
ALTER TABLE "design"."design_files" DROP CONSTRAINT "design_files_file_id_fkey";

-- DropForeignKey
ALTER TABLE "design"."design_files" DROP CONSTRAINT "design_files_created_by_fkey";

-- DropForeignKey
ALTER TABLE "inventory"."product_inventory" DROP CONSTRAINT "product_inventory_product_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory"."product_inventory" DROP CONSTRAINT "product_inventory_lot_number_fkey";

-- DropForeignKey
ALTER TABLE "inventory"."material_inventory" DROP CONSTRAINT "material_inventory_material_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory"."inventory_reservations" DROP CONSTRAINT "inventory_reservations_sales_order_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory"."inventory_reservations" DROP CONSTRAINT "inventory_reservations_work_order_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory"."inventory_transactions" DROP CONSTRAINT "inventory_transactions_created_by_fkey";

-- DropForeignKey
ALTER TABLE "inventory"."material_receipts" DROP CONSTRAINT "material_receipts_material_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory"."material_receipts" DROP CONSTRAINT "material_receipts_supplier_bp_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory"."material_receipts" DROP CONSTRAINT "material_receipts_created_by_fkey";

-- DropForeignKey
ALTER TABLE "master"."products" DROP CONSTRAINT "products_design_file_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."sales_orders" DROP CONSTRAINT "sales_orders_order_acceptance_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."sales_orders" DROP CONSTRAINT "sales_orders_product_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."sales_orders" DROP CONSTRAINT "sales_orders_end_user_bp_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."sales_orders" DROP CONSTRAINT "sales_orders_created_by_fkey";

-- DropForeignKey
ALTER TABLE "production"."work_orders" DROP CONSTRAINT "work_orders_sales_order_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."work_orders" DROP CONSTRAINT "work_orders_material_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."work_orders" DROP CONSTRAINT "work_orders_source_work_order_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."work_orders" DROP CONSTRAINT "work_orders_created_by_fkey";

-- DropForeignKey
ALTER TABLE "production"."work_order_inspection_templates" DROP CONSTRAINT "work_order_inspection_templates_work_order_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."work_order_inspection_templates" DROP CONSTRAINT "work_order_inspection_templates_inspection_template_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."process_step_use_dependencies" DROP CONSTRAINT "process_step_use_dependencies_step_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."process_step_use_dependencies" DROP CONSTRAINT "process_step_use_dependencies_depends_on_step_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."process_step_exec_dependencies" DROP CONSTRAINT "process_step_exec_dependencies_step_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."process_step_exec_dependencies" DROP CONSTRAINT "process_step_exec_dependencies_depends_on_step_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."work_order_steps" DROP CONSTRAINT "work_order_steps_work_order_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."work_order_steps" DROP CONSTRAINT "work_order_steps_process_step_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."work_order_steps" DROP CONSTRAINT "work_order_steps_supplier_bp_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."work_order_steps" DROP CONSTRAINT "work_order_steps_session_locked_by_fkey";

-- DropForeignKey
ALTER TABLE "production"."work_order_steps" DROP CONSTRAINT "work_order_steps_started_by_fkey";

-- DropForeignKey
ALTER TABLE "production"."work_order_steps" DROP CONSTRAINT "work_order_steps_completed_by_fkey";

-- DropForeignKey
ALTER TABLE "production"."work_order_steps" DROP CONSTRAINT "work_order_steps_cancelled_by_fkey";

-- DropForeignKey
ALTER TABLE "production"."approval_group_members" DROP CONSTRAINT "approval_group_members_group_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."approval_group_members" DROP CONSTRAINT "approval_group_members_user_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."approval_delegates" DROP CONSTRAINT "approval_delegates_group_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."approval_delegates" DROP CONSTRAINT "approval_delegates_delegator_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."approval_delegates" DROP CONSTRAINT "approval_delegates_delegate_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."approval_delegates" DROP CONSTRAINT "approval_delegates_created_by_fkey";

-- DropForeignKey
ALTER TABLE "production"."approval_requests" DROP CONSTRAINT "approval_requests_work_order_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."approval_requests" DROP CONSTRAINT "approval_requests_requested_by_fkey";

-- DropForeignKey
ALTER TABLE "production"."approval_records" DROP CONSTRAINT "approval_records_approval_request_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."approval_records" DROP CONSTRAINT "approval_records_approver_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."approval_records" DROP CONSTRAINT "approval_records_delegate_for_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."inspection_templates" DROP CONSTRAINT "inspection_templates_related_process_step_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."inspection_template_items" DROP CONSTRAINT "inspection_template_items_template_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."inspection_records" DROP CONSTRAINT "inspection_records_work_order_step_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."inspection_records" DROP CONSTRAINT "inspection_records_template_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."inspection_records" DROP CONSTRAINT "inspection_records_recorded_by_fkey";

-- DropForeignKey
ALTER TABLE "production"."inspection_records" DROP CONSTRAINT "inspection_records_approved_by_fkey";

-- DropForeignKey
ALTER TABLE "production"."inspection_record_items" DROP CONSTRAINT "inspection_record_items_inspection_record_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."inspection_record_items" DROP CONSTRAINT "inspection_record_items_template_item_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."defect_records" DROP CONSTRAINT "defect_records_work_order_step_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."defect_records" DROP CONSTRAINT "defect_records_defect_type_id_fkey";

-- DropForeignKey
ALTER TABLE "production"."defect_records" DROP CONSTRAINT "defect_records_recorded_by_fkey";

-- DropForeignKey
ALTER TABLE "sales"."price_lists" DROP CONSTRAINT "price_lists_customer_bp_id_fkey";

-- DropForeignKey
ALTER TABLE "sales"."price_lists" DROP CONSTRAINT "price_lists_product_id_fkey";

-- DropForeignKey
ALTER TABLE "sales"."price_lists" DROP CONSTRAINT "price_lists_created_by_fkey";

-- DropForeignKey
ALTER TABLE "sales"."quote_items" DROP CONSTRAINT "quote_items_price_list_id_fkey";

-- DropForeignKey
ALTER TABLE "sales"."order_acceptances" DROP CONSTRAINT "order_acceptances_quote_id_fkey";

-- DropForeignKey
ALTER TABLE "sales"."order_acceptances" DROP CONSTRAINT "order_acceptances_customer_bp_id_fkey";

-- DropForeignKey
ALTER TABLE "sales"."order_acceptances" DROP CONSTRAINT "order_acceptances_customer_branch_bp_id_fkey";

-- DropForeignKey
ALTER TABLE "sales"."order_acceptances" DROP CONSTRAINT "order_acceptances_order_doc_file_id_fkey";

-- DropForeignKey
ALTER TABLE "sales"."order_acceptances" DROP CONSTRAINT "order_acceptances_created_by_fkey";

-- DropForeignKey
ALTER TABLE "shipping"."shipping_orders" DROP CONSTRAINT "shipping_orders_sales_order_id_fkey";

-- DropForeignKey
ALTER TABLE "shipping"."shipping_orders" DROP CONSTRAINT "shipping_orders_work_order_id_fkey";

-- DropForeignKey
ALTER TABLE "shipping"."shipping_orders" DROP CONSTRAINT "shipping_orders_created_by_fkey";

-- DropForeignKey
ALTER TABLE "shipping"."shipping_order_items" DROP CONSTRAINT "shipping_order_items_shipping_order_id_fkey";

-- DropForeignKey
ALTER TABLE "shipping"."shipping_order_items" DROP CONSTRAINT "shipping_order_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "shipping"."delivery_notes" DROP CONSTRAINT "delivery_notes_shipping_order_id_fkey";

-- DropForeignKey
ALTER TABLE "shipping"."delivery_notes" DROP CONSTRAINT "delivery_notes_recipient_bp_id_fkey";

-- DropForeignKey
ALTER TABLE "shipping"."delivery_notes" DROP CONSTRAINT "delivery_notes_recipient_branch_bp_id_fkey";

-- DropForeignKey
ALTER TABLE "shipping"."delivery_notes" DROP CONSTRAINT "delivery_notes_end_user_bp_id_fkey";

-- DropForeignKey
ALTER TABLE "shipping"."delivery_notes" DROP CONSTRAINT "delivery_notes_pdf_file_id_fkey";

-- DropForeignKey
ALTER TABLE "shipping"."delivery_notes" DROP CONSTRAINT "delivery_notes_created_by_fkey";

-- DropForeignKey
ALTER TABLE "shipping"."delivery_note_items" DROP CONSTRAINT "delivery_note_items_delivery_note_id_fkey";

-- DropForeignKey
ALTER TABLE "shipping"."delivery_note_items" DROP CONSTRAINT "delivery_note_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "sys"."feature_flags" DROP CONSTRAINT "feature_flags_updated_by_fkey";

-- AlterTable
ALTER TABLE "master"."products" DROP COLUMN "design_file_id";

-- AlterTable
ALTER TABLE "sales"."quote_items" DROP COLUMN "price_list_id",
ADD COLUMN     "price_list_tier_id" UUID;

-- DropTable
DROP TABLE "billing"."invoices";

-- DropTable
DROP TABLE "billing"."invoice_items";

-- DropTable
DROP TABLE "billing"."billing_closings";

-- DropTable
DROP TABLE "bp"."bp_vendor_attrs";

-- DropTable
DROP TABLE "bp"."bp_end_user_attrs";

-- DropTable
DROP TABLE "design"."design_requests";

-- DropTable
DROP TABLE "design"."design_files";

-- DropTable
DROP TABLE "inventory"."product_inventory";

-- DropTable
DROP TABLE "inventory"."material_inventory";

-- DropTable
DROP TABLE "inventory"."inventory_reservations";

-- DropTable
DROP TABLE "inventory"."inventory_transactions";

-- DropTable
DROP TABLE "inventory"."material_receipts";

-- DropTable
DROP TABLE "log"."system_logs";

-- DropTable
DROP TABLE "log"."audit_logs";

-- DropTable
DROP TABLE "log"."ad_sync_logs";

-- DropTable
DROP TABLE "production"."sales_orders";

-- DropTable
DROP TABLE "production"."work_orders";

-- DropTable
DROP TABLE "production"."work_order_inspection_templates";

-- DropTable
DROP TABLE "production"."process_step_catalog";

-- DropTable
DROP TABLE "production"."process_step_use_dependencies";

-- DropTable
DROP TABLE "production"."process_step_exec_dependencies";

-- DropTable
DROP TABLE "production"."work_order_steps";

-- DropTable
DROP TABLE "production"."approval_groups";

-- DropTable
DROP TABLE "production"."approval_group_members";

-- DropTable
DROP TABLE "production"."approval_delegates";

-- DropTable
DROP TABLE "production"."approval_requests";

-- DropTable
DROP TABLE "production"."approval_records";

-- DropTable
DROP TABLE "production"."inspection_templates";

-- DropTable
DROP TABLE "production"."inspection_template_items";

-- DropTable
DROP TABLE "production"."inspection_records";

-- DropTable
DROP TABLE "production"."inspection_record_items";

-- DropTable
DROP TABLE "production"."defect_types";

-- DropTable
DROP TABLE "production"."defect_records";

-- DropTable
DROP TABLE "sales"."price_lists";

-- DropTable
DROP TABLE "sales"."order_acceptances";

-- DropTable
DROP TABLE "shipping"."shipping_orders";

-- DropTable
DROP TABLE "shipping"."shipping_order_items";

-- DropTable
DROP TABLE "shipping"."delivery_notes";

-- DropTable
DROP TABLE "shipping"."delivery_note_items";

-- DropTable
DROP TABLE "sys"."feature_flags";

-- DropEnum
DROP TYPE "billing"."INVOICE_STATUS";

-- DropEnum
DROP TYPE "billing"."CLOSING_STATUS";

-- DropEnum
DROP TYPE "bp"."VENDOR_TYPE";

-- DropEnum
DROP TYPE "design"."DESIGN_TRIGGER";

-- DropEnum
DROP TYPE "design"."DESIGN_STATUS";

-- DropEnum
DROP TYPE "inventory"."INVENTORY_TYPE";

-- DropEnum
DROP TYPE "inventory"."RESERVATION_STATUS";

-- DropEnum
DROP TYPE "inventory"."TRANSACTION_TYPE";

-- DropEnum
DROP TYPE "log"."SYNC_STATUS";

-- DropEnum
DROP TYPE "production"."SALES_ORDER_STATUS";

-- DropEnum
DROP TYPE "production"."WORK_ORDER_TYPE";

-- DropEnum
DROP TYPE "production"."WORK_ORDER_STATUS";

-- DropEnum
DROP TYPE "production"."WORK_ORDER_APPROVAL_STATUS";

-- DropEnum
DROP TYPE "production"."PROCESS_CATEGORY";

-- DropEnum
DROP TYPE "production"."PROCESS_EXECUTION";

-- DropEnum
DROP TYPE "production"."DEPENDENCY_RELATION";

-- DropEnum
DROP TYPE "production"."STEP_EXECUTION";

-- DropEnum
DROP TYPE "production"."STEP_STATUS";

-- DropEnum
DROP TYPE "production"."APPROVAL_GROUP_TYPE";

-- DropEnum
DROP TYPE "production"."APPROVAL_STEP";

-- DropEnum
DROP TYPE "production"."APPROVAL_REQUEST_STATUS";

-- DropEnum
DROP TYPE "production"."APPROVAL_ACTION";

-- DropEnum
DROP TYPE "production"."INSPECTION_STATUS";

-- DropEnum
DROP TYPE "sales"."ORDER_ACCEPTANCE_STATUS";

-- DropEnum
DROP TYPE "shipping"."SHIPPING_TYPE";

-- DropEnum
DROP TYPE "shipping"."SHIPPING_STATUS";

-- DropEnum
DROP TYPE "shipping"."DELIVERY_METHOD";

-- DropEnum
DROP TYPE "shipping"."DELIVERY_STATUS";

-- CreateTable
CREATE TABLE "sales"."estimates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "estimate_number" TEXT NOT NULL,
    "customer_bp_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "order_type" "sales"."ORDER_TYPE" NOT NULL,
    "material_id" TEXT,
    "material_unit_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "machining_minutes" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "machining_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "outsource_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "setup_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "margin_rate" DECIMAL(5,2) NOT NULL DEFAULT 30,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "status" "sales"."ESTIMATE_STATUS" NOT NULL DEFAULT 'DRAFT',
    "registered_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."estimate_tiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "estimate_id" UUID NOT NULL,
    "min_quantity" INTEGER NOT NULL,
    "max_quantity" INTEGER,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "price_list_entry_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "estimate_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."price_list_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_bp_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "order_type" "sales"."ORDER_TYPE" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "estimate_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "price_list_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."price_list_tiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "price_list_entry_id" UUID NOT NULL,
    "min_quantity" INTEGER NOT NULL DEFAULT 1,
    "max_quantity" INTEGER,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "price_list_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "estimates_estimate_number_key" ON "sales"."estimates"("estimate_number");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_entries_customer_bp_id_product_id_order_type_key" ON "sales"."price_list_entries"("customer_bp_id", "product_id", "order_type");

-- CreateIndex
CREATE INDEX "price_list_tiers_price_list_entry_id_min_quantity_idx" ON "sales"."price_list_tiers"("price_list_entry_id", "min_quantity");

-- AddForeignKey
ALTER TABLE "sales"."estimates" ADD CONSTRAINT "estimates_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."estimates" ADD CONSTRAINT "estimates_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."estimates" ADD CONSTRAINT "estimates_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "master"."materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."estimates" ADD CONSTRAINT "estimates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."estimate_tiers" ADD CONSTRAINT "estimate_tiers_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "sales"."estimates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."estimate_tiers" ADD CONSTRAINT "estimate_tiers_price_list_entry_id_fkey" FOREIGN KEY ("price_list_entry_id") REFERENCES "sales"."price_list_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."price_list_entries" ADD CONSTRAINT "price_list_entries_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."price_list_entries" ADD CONSTRAINT "price_list_entries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."price_list_entries" ADD CONSTRAINT "price_list_entries_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "sales"."estimates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."price_list_entries" ADD CONSTRAINT "price_list_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."price_list_tiers" ADD CONSTRAINT "price_list_tiers_price_list_entry_id_fkey" FOREIGN KEY ("price_list_entry_id") REFERENCES "sales"."price_list_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."quote_items" ADD CONSTRAINT "quote_items_price_list_tier_id_fkey" FOREIGN KEY ("price_list_tier_id") REFERENCES "sales"."price_list_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop the now-empty domain schemas (re-created when their features land)
DROP SCHEMA IF EXISTS "billing";
DROP SCHEMA IF EXISTS "design";
DROP SCHEMA IF EXISTS "inventory";
DROP SCHEMA IF EXISTS "log";
DROP SCHEMA IF EXISTS "production";
DROP SCHEMA IF EXISTS "shipping";
