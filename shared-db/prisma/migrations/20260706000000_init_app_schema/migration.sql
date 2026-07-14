-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "directory";

-- CreateEnum
CREATE TYPE "app"."USER_GROUP" AS ENUM ('SYSTEM', 'EMPLOYEE', 'GUEST');

-- CreateEnum
CREATE TYPE "app"."ACTION" AS ENUM ('READ', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'APPROVE', 'ADMIN');

-- CreateEnum
CREATE TYPE "app"."SCOPE" AS ENUM ('ALL', 'REGION', 'COUNTRY', 'FACTORY', 'DEPARTMENT', 'TEAM', 'SUB', 'OWN');

-- CreateEnum
CREATE TYPE "app"."BP_ROLE" AS ENUM ('CUSTOMER', 'VENDOR', 'END_USER');

-- CreateEnum
CREATE TYPE "app"."VENDOR_TYPE" AS ENUM ('SUPPLIER', 'OUTSOURCE');

-- CreateEnum
CREATE TYPE "app"."TAX_TYPE" AS ENUM ('TAXABLE', 'EXEMPT', 'REDUCED');

-- CreateEnum
CREATE TYPE "app"."INVOICE_METHOD" AS ENUM ('EMAIL', 'FAX', 'POST', 'PORTAL');

-- CreateEnum
CREATE TYPE "app"."MATERIAL_FORM" AS ENUM ('POLISHED', 'STANDARD_LENGTH', 'SEMI_FINISHED', 'OTHER');

-- CreateEnum
CREATE TYPE "app"."ORDER_TYPE" AS ENUM ('PRODUCTION', 'TEST', 'SAMPLE', 'OTHER');

-- CreateEnum
CREATE TYPE "app"."TRIAL_TOOL_TYPE" AS ENUM ('ROUND_BAR', 'CYLINDER', 'OH');

-- CreateEnum
CREATE TYPE "app"."ESTIMATE_STATUS" AS ENUM ('DRAFT', 'CONFIRMED', 'REGISTERED');

-- CreateEnum
CREATE TYPE "app"."QUOTE_STATUS" AS ENUM ('DRAFT', 'ISSUED', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "app"."PRICE_DISCOUNT_TYPE" AS ENUM ('RATE', 'AMOUNT');

-- CreateTable
CREATE TABLE "app"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group" "app"."USER_GROUP" NOT NULL,
    "employee_id" UUID,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."roles" (
    "id" SERIAL NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "rolename" TEXT NOT NULL,
    "display_name" JSONB NOT NULL,
    "description" JSONB,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."user_role_relation" (
    "user_id" UUID NOT NULL,
    "role_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivate_at" TIMESTAMPTZ(6),
    "assigned_by" UUID,

    CONSTRAINT "user_role_relation_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "app"."permissions" (
    "code" TEXT NOT NULL,
    "display_name" JSONB NOT NULL,
    "description" JSONB,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "app"."role_permission_relation" (
    "role_id" INTEGER NOT NULL,
    "permission_code" TEXT NOT NULL,
    "action" "app"."ACTION" NOT NULL,
    "scope" "app"."SCOPE" NOT NULL,
    "scope_custom" INTEGER,

    CONSTRAINT "role_permission_relation_pkey" PRIMARY KEY ("role_id","action","permission_code")
);

-- CreateTable
CREATE TABLE "app"."business_partners" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bp_code" TEXT,
    "name" JSONB NOT NULL,
    "name_kana" TEXT,
    "short_name" TEXT,
    "parent_id" UUID,
    "country_code" VARCHAR(2),
    "postal_code" TEXT,
    "address" JSONB,
    "phone" TEXT,
    "fax" TEXT,
    "email" TEXT,
    "website" TEXT,
    "tax_number" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "business_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."bp_role_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bp_id" UUID NOT NULL,
    "role" "app"."BP_ROLE" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "bp_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."bp_customer_attrs" (
    "bp_id" UUID NOT NULL,
    "customer_code" TEXT,
    "billing_bp_id" UUID,
    "closing_day" SMALLINT,
    "payment_terms_days" INTEGER,
    "payment_day" SMALLINT,
    "credit_limit" DECIMAL(15,2),
    "tax_type" "app"."TAX_TYPE" NOT NULL DEFAULT 'TAXABLE',
    "invoice_method" "app"."INVOICE_METHOD" NOT NULL DEFAULT 'EMAIL',
    "is_consignment" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "bp_customer_attrs_pkey" PRIMARY KEY ("bp_id")
);

-- CreateTable
CREATE TABLE "app"."bp_vendor_attrs" (
    "bp_id" UUID NOT NULL,
    "vendor_code" TEXT,
    "vendor_type" "app"."VENDOR_TYPE" NOT NULL,
    "closing_day" SMALLINT,
    "payment_terms_days" INTEGER,
    "payment_day" SMALLINT,
    "bank_name" TEXT,
    "bank_branch" TEXT,
    "bank_account_type" TEXT,
    "bank_account_number" TEXT,
    "lead_time_days" INTEGER,
    "notes" TEXT,

    CONSTRAINT "bp_vendor_attrs_pkey" PRIMARY KEY ("bp_id")
);

-- CreateTable
CREATE TABLE "app"."bp_end_user_attrs" (
    "bp_id" UUID NOT NULL,
    "industry" TEXT,
    "notes" TEXT,

    CONSTRAINT "bp_end_user_attrs_pkey" PRIMARY KEY ("bp_id")
);

-- CreateTable
CREATE TABLE "app"."bp_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bp_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_kana" TEXT,
    "department" TEXT,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bp_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."material_types" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "material_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."materials" (
    "id" TEXT NOT NULL,
    "material_type_id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "unit" TEXT NOT NULL,
    "material_form" "app"."MATERIAL_FORM" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."products" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "material_id" TEXT,
    "unit" TEXT NOT NULL DEFAULT '本',
    "spec" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."estimates" (
    "year_month" CHAR(6) NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "tool_type" "app"."TRIAL_TOOL_TYPE" NOT NULL,
    "status" "app"."ESTIMATE_STATUS" NOT NULL DEFAULT 'DRAFT',
    "customer_bp_id" UUID,
    "material_id" TEXT,
    "reference_unit_price" DECIMAL(12,2),
    "reference_date" DATE,
    "reference_overridden" BOOLEAN NOT NULL DEFAULT false,
    "input" JSONB NOT NULL,
    "result" JSONB,
    "registered_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "estimates_pkey" PRIMARY KEY ("year_month","seq")
);

-- CreateTable
CREATE TABLE "app"."price_list_entries" (
    "customer_bp_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "order_type" "app"."ORDER_TYPE" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "base_unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "estimate_year_month" CHAR(6),
    "estimate_seq" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "price_list_entries_pkey" PRIMARY KEY ("customer_bp_id","product_id","order_type")
);

-- CreateTable
CREATE TABLE "app"."price_list_tiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_bp_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "order_type" "app"."ORDER_TYPE" NOT NULL,
    "min_quantity" INTEGER NOT NULL DEFAULT 1,
    "max_quantity" INTEGER,
    "multiplier" DECIMAL(8,3) NOT NULL DEFAULT 1,
    "price_override" DECIMAL(12,2),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "price_list_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."price_list_discounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_bp_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "order_type" "app"."ORDER_TYPE" NOT NULL,
    "label" TEXT NOT NULL,
    "discount_type" "app"."PRICE_DISCOUNT_TYPE" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "min_quantity" INTEGER NOT NULL DEFAULT 1,
    "max_quantity" INTEGER,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_list_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."quotes" (
    "year_month" CHAR(6) NOT NULL,
    "seq" INTEGER NOT NULL,
    "customer_bp_id" UUID NOT NULL,
    "customer_branch_bp_id" UUID,
    "status" "app"."QUOTE_STATUS" NOT NULL DEFAULT 'DRAFT',
    "valid_until" DATE,
    "notes" TEXT,
    "pdf_file_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("year_month","seq")
);

-- CreateTable
CREATE TABLE "app"."quote_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quote_year_month" CHAR(6) NOT NULL,
    "quote_seq" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "order_type" "app"."ORDER_TYPE" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "price_list_tier_id" UUID,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_label" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "delivery_date" DATE,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storage_key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."numbering_sequences" (
    "key" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "last_year_month" TEXT,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "numbering_sequences_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "app"."users"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "app"."users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "roles_rolename_key" ON "app"."roles"("rolename");

-- CreateIndex
CREATE UNIQUE INDEX "business_partners_bp_code_key" ON "app"."business_partners"("bp_code");

-- CreateIndex
CREATE INDEX "business_partners_parent_id_idx" ON "app"."business_partners"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "bp_role_assignments_bp_id_role_key" ON "app"."bp_role_assignments"("bp_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "bp_customer_attrs_customer_code_key" ON "app"."bp_customer_attrs"("customer_code");

-- CreateIndex
CREATE UNIQUE INDEX "bp_vendor_attrs_vendor_code_key" ON "app"."bp_vendor_attrs"("vendor_code");

-- CreateIndex
CREATE INDEX "bp_contacts_bp_id_idx" ON "app"."bp_contacts"("bp_id");

-- Shared directory: add the immutable AD objectGUID as the stable key
-- the app FKs to. The table itself is owned by ldap_sync and already
-- exists, so we ALTER it here rather than CREATE it.
ALTER TABLE "directory"."employee_directory" ADD COLUMN IF NOT EXISTS "ldap_guid" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "employee_directory_ldap_guid_key" ON "directory"."employee_directory"("ldap_guid");

-- CreateIndex
CREATE INDEX "price_list_tiers_customer_bp_id_product_id_order_type_min_q_idx" ON "app"."price_list_tiers"("customer_bp_id", "product_id", "order_type", "min_quantity");

-- CreateIndex
CREATE INDEX "price_list_discounts_customer_bp_id_product_id_order_type_idx" ON "app"."price_list_discounts"("customer_bp_id", "product_id", "order_type");

-- AddForeignKey
ALTER TABLE "app"."users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "directory"."employee_directory"("ldap_guid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."user_role_relation" ADD CONSTRAINT "user_role_relation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."user_role_relation" ADD CONSTRAINT "user_role_relation_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "app"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."user_role_relation" ADD CONSTRAINT "user_role_relation_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."role_permission_relation" ADD CONSTRAINT "role_permission_relation_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "app"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."role_permission_relation" ADD CONSTRAINT "role_permission_relation_permission_code_fkey" FOREIGN KEY ("permission_code") REFERENCES "app"."permissions"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."business_partners" ADD CONSTRAINT "business_partners_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."business_partners" ADD CONSTRAINT "business_partners_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."bp_role_assignments" ADD CONSTRAINT "bp_role_assignments_bp_id_fkey" FOREIGN KEY ("bp_id") REFERENCES "app"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."bp_customer_attrs" ADD CONSTRAINT "bp_customer_attrs_bp_id_fkey" FOREIGN KEY ("bp_id") REFERENCES "app"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."bp_customer_attrs" ADD CONSTRAINT "bp_customer_attrs_billing_bp_id_fkey" FOREIGN KEY ("billing_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."bp_vendor_attrs" ADD CONSTRAINT "bp_vendor_attrs_bp_id_fkey" FOREIGN KEY ("bp_id") REFERENCES "app"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."bp_end_user_attrs" ADD CONSTRAINT "bp_end_user_attrs_bp_id_fkey" FOREIGN KEY ("bp_id") REFERENCES "app"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."bp_contacts" ADD CONSTRAINT "bp_contacts_bp_id_fkey" FOREIGN KEY ("bp_id") REFERENCES "app"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."materials" ADD CONSTRAINT "materials_material_type_id_fkey" FOREIGN KEY ("material_type_id") REFERENCES "app"."material_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."products" ADD CONSTRAINT "products_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "app"."materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."estimates" ADD CONSTRAINT "estimates_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."estimates" ADD CONSTRAINT "estimates_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "app"."materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."estimates" ADD CONSTRAINT "estimates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."price_list_entries" ADD CONSTRAINT "price_list_entries_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."price_list_entries" ADD CONSTRAINT "price_list_entries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."price_list_entries" ADD CONSTRAINT "price_list_entries_estimate_year_month_estimate_seq_fkey" FOREIGN KEY ("estimate_year_month", "estimate_seq") REFERENCES "app"."estimates"("year_month", "seq") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."price_list_entries" ADD CONSTRAINT "price_list_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."price_list_tiers" ADD CONSTRAINT "price_list_tiers_customer_bp_id_product_id_order_type_fkey" FOREIGN KEY ("customer_bp_id", "product_id", "order_type") REFERENCES "app"."price_list_entries"("customer_bp_id", "product_id", "order_type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."price_list_discounts" ADD CONSTRAINT "price_list_discounts_customer_bp_id_product_id_order_type_fkey" FOREIGN KEY ("customer_bp_id", "product_id", "order_type") REFERENCES "app"."price_list_entries"("customer_bp_id", "product_id", "order_type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."quotes" ADD CONSTRAINT "quotes_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."quotes" ADD CONSTRAINT "quotes_customer_branch_bp_id_fkey" FOREIGN KEY ("customer_branch_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."quotes" ADD CONSTRAINT "quotes_pdf_file_id_fkey" FOREIGN KEY ("pdf_file_id") REFERENCES "app"."files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."quotes" ADD CONSTRAINT "quotes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."quote_items" ADD CONSTRAINT "quote_items_quote_year_month_quote_seq_fkey" FOREIGN KEY ("quote_year_month", "quote_seq") REFERENCES "app"."quotes"("year_month", "seq") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."quote_items" ADD CONSTRAINT "quote_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."quote_items" ADD CONSTRAINT "quote_items_price_list_tier_id_fkey" FOREIGN KEY ("price_list_tier_id") REFERENCES "app"."price_list_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."files" ADD CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── app.user_permissions — highest scope per (user, action, permission) ──
-- Always query this view for RBAC, never the relation tables.
CREATE VIEW "app"."user_permissions" AS
 SELECT DISTINCT ON (urr.user_id, rpr.action, rpr.permission_code)
    urr.user_id,
    rpr.action,
    rpr.permission_code,
    rpr.scope,
    rpr.scope_custom
   FROM "app"."user_role_relation" urr
     JOIN "app"."roles" r ON r.id = urr.role_id
     JOIN "app"."role_permission_relation" rpr ON rpr.role_id = urr.role_id
   WHERE urr.is_active
     AND (urr.deactivate_at IS NULL OR urr.deactivate_at > now())
   ORDER BY urr.user_id, rpr.action, rpr.permission_code,
     CASE rpr.scope
       WHEN 'ALL' THEN 0
       WHEN 'REGION' THEN 1
       WHEN 'COUNTRY' THEN 2
       WHEN 'FACTORY' THEN 3
       WHEN 'DEPARTMENT' THEN 4
       WHEN 'TEAM' THEN 5
       WHEN 'SUB' THEN 6
       WHEN 'OWN' THEN 7
     END;

-- ── Extensions ────────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgroonga;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgroonga unavailable on this host — skipped (dev only; the production image ships it)';
END $$;
