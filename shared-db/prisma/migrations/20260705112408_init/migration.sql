-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "admintools";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auth";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "bp";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "directory";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "kot";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "master";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "sales";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "sys";

-- CreateEnum
CREATE TYPE "auth"."USER_GROUP" AS ENUM ('SYSTEM', 'EMPLOYEE', 'GUEST');

-- CreateEnum
CREATE TYPE "auth"."ACTION" AS ENUM ('READ', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'APPROVE', 'ADMIN');

-- CreateEnum
CREATE TYPE "auth"."SCOPE" AS ENUM ('ALL', 'REGION', 'COUNTRY', 'FACTORY', 'DEPARTMENT', 'TEAM', 'SUB', 'OWN');

-- CreateEnum
CREATE TYPE "bp"."BP_ROLE" AS ENUM ('CUSTOMER', 'VENDOR', 'END_USER');

-- CreateEnum
CREATE TYPE "bp"."TAX_TYPE" AS ENUM ('TAXABLE', 'EXEMPT', 'REDUCED');

-- CreateEnum
CREATE TYPE "bp"."INVOICE_METHOD" AS ENUM ('EMAIL', 'FAX', 'POST', 'PORTAL');

-- CreateEnum
CREATE TYPE "master"."MATERIAL_FORM" AS ENUM ('POLISHED', 'STANDARD_LENGTH', 'SEMI_FINISHED', 'OTHER');

-- CreateEnum
CREATE TYPE "sales"."ORDER_TYPE" AS ENUM ('PRODUCTION', 'TEST', 'SAMPLE', 'OTHER');

-- CreateEnum
CREATE TYPE "sales"."ESTIMATE_STATUS" AS ENUM ('DRAFT', 'CONFIRMED', 'REGISTERED');

-- CreateEnum
CREATE TYPE "sales"."QUOTE_STATUS" AS ENUM ('DRAFT', 'ISSUED', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "admintools"."mail_accounts" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "quota_gb" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "notes" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" VARCHAR(16) NOT NULL DEFAULT 'shared',
    "type" VARCHAR(16) NOT NULL DEFAULT 'other',
    "extra_aliases" TEXT NOT NULL DEFAULT '',
    "password_dirty" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "mail_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admintools"."group_members" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "username" VARCHAR(64) NOT NULL,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group" "auth"."USER_GROUP" NOT NULL,
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
CREATE TABLE "auth"."roles" (
    "id" SERIAL NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "rolename" TEXT NOT NULL,
    "display_name" JSONB NOT NULL,
    "description" JSONB,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."user_role_relation" (
    "user_id" UUID NOT NULL,
    "role_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivate_at" TIMESTAMPTZ(6),
    "assigned_by" UUID,

    CONSTRAINT "user_role_relation_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "auth"."permissions" (
    "code" TEXT NOT NULL,
    "display_name" JSONB NOT NULL,
    "description" JSONB,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "auth"."role_permission_relation" (
    "role_id" INTEGER NOT NULL,
    "permission_code" TEXT NOT NULL,
    "action" "auth"."ACTION" NOT NULL,
    "scope" "auth"."SCOPE" NOT NULL,
    "scope_custom" INTEGER,

    CONSTRAINT "role_permission_relation_pkey" PRIMARY KEY ("role_id","action","permission_code")
);

-- CreateTable
CREATE TABLE "bp"."business_partners" (
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
CREATE TABLE "bp"."bp_role_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bp_id" UUID NOT NULL,
    "role" "bp"."BP_ROLE" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at" TIMESTAMPTZ(6),

    CONSTRAINT "bp_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bp"."bp_customer_attrs" (
    "bp_id" UUID NOT NULL,
    "customer_code" TEXT,
    "billing_bp_id" UUID,
    "closing_day" SMALLINT,
    "payment_terms_days" INTEGER,
    "payment_day" SMALLINT,
    "credit_limit" DECIMAL(15,2),
    "tax_type" "bp"."TAX_TYPE" NOT NULL DEFAULT 'TAXABLE',
    "invoice_method" "bp"."INVOICE_METHOD" NOT NULL DEFAULT 'EMAIL',
    "is_consignment" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "bp_customer_attrs_pkey" PRIMARY KEY ("bp_id")
);

-- CreateTable
CREATE TABLE "bp"."bp_contacts" (
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
CREATE TABLE "directory"."employee_directory" (
    "username" TEXT NOT NULL,
    "display_name" TEXT,
    "email" TEXT,
    "department" TEXT,
    "title" TEXT,
    "company" TEXT,
    "office" TEXT,
    "manager" TEXT,
    "is_active" BOOLEAN,
    "employee_code" INTEGER,
    "last_synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_directory_pkey" PRIMARY KEY ("username")
);

-- CreateTable
CREATE TABLE "directory"."ldap_sync_log" (
    "id" BIGSERIAL NOT NULL,
    "finished_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT,
    "status" TEXT,
    "total" INTEGER,
    "message" TEXT,

    CONSTRAINT "ldap_sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kot"."employees" (
    "employee_code" INTEGER NOT NULL,
    "username" TEXT NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("employee_code")
);

-- CreateTable
CREATE TABLE "kot"."kot_employees" (
    "employee_code" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kot_employees_pkey" PRIMARY KEY ("employee_code")
);

-- CreateTable
CREATE TABLE "kot"."kot_match_review" (
    "employee_code" INTEGER NOT NULL,
    "kot_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "candidates" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kot_match_review_pkey" PRIMARY KEY ("employee_code")
);

-- CreateTable
CREATE TABLE "kot"."hr_records" (
    "id" BIGSERIAL NOT NULL,
    "employee_username" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "wt_normal" INTEGER,
    "wt_overtime" INTEGER,
    "wt_overtime_night" INTEGER,
    "wt_night" INTEGER,
    "wt_leave_late" INTEGER,
    "pto" INTEGER,
    "plan_start" TIMESTAMP(6),
    "plan_end" TIMESTAMP(6),
    "record_starts" TIMESTAMP(6)[],
    "record_ends" TIMESTAMP(6)[],
    "rest_starts" TIMESTAMP(6)[],
    "rest_ends" TIMESTAMP(6)[],

    CONSTRAINT "hr_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kot"."import_runs" (
    "id" BIGSERIAL NOT NULL,
    "finished_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "start_date" DATE,
    "end_date" DATE,
    "days" INTEGER,
    "rows" INTEGER,
    "status" TEXT,
    "message" TEXT,

    CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master"."material_types" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "material_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master"."materials" (
    "id" TEXT NOT NULL,
    "material_type_id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "unit" TEXT NOT NULL,
    "material_form" "master"."MATERIAL_FORM" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master"."products" (
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

-- CreateTable
CREATE TABLE "sales"."quotes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quote_number" TEXT NOT NULL,
    "customer_bp_id" UUID NOT NULL,
    "customer_branch_bp_id" UUID,
    "status" "sales"."QUOTE_STATUS" NOT NULL DEFAULT 'DRAFT',
    "valid_until" DATE,
    "notes" TEXT,
    "pdf_file_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."quote_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quote_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "order_type" "sales"."ORDER_TYPE" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "price_list_tier_id" UUID,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL,
    "delivery_date" DATE,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys"."files" (
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
CREATE TABLE "sys"."numbering_sequences" (
    "key" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "last_year_month" TEXT,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "numbering_sequences_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "ix_mail_accounts_username" ON "admintools"."mail_accounts"("username");

-- CreateIndex
CREATE INDEX "ix_group_members_group_id" ON "admintools"."group_members"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_group_member" ON "admintools"."group_members"("group_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "auth"."users"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "auth"."users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "roles_rolename_key" ON "auth"."roles"("rolename");

-- CreateIndex
CREATE UNIQUE INDEX "business_partners_bp_code_key" ON "bp"."business_partners"("bp_code");

-- CreateIndex
CREATE INDEX "business_partners_parent_id_idx" ON "bp"."business_partners"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "bp_role_assignments_bp_id_role_key" ON "bp"."bp_role_assignments"("bp_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "bp_customer_attrs_customer_code_key" ON "bp"."bp_customer_attrs"("customer_code");

-- CreateIndex
CREATE INDEX "bp_contacts_bp_id_idx" ON "bp"."bp_contacts"("bp_id");

-- CreateIndex
CREATE INDEX "idx_ldap_sync_log_finished" ON "directory"."ldap_sync_log"("finished_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "employees_username_key" ON "kot"."employees"("username");

-- CreateIndex
CREATE INDEX "idx_hr_records_zone_date" ON "kot"."hr_records"("zone", "date");

-- CreateIndex
CREATE UNIQUE INDEX "uq_hr_records" ON "kot"."hr_records"("employee_username", "zone", "date");

-- CreateIndex
CREATE UNIQUE INDEX "estimates_estimate_number_key" ON "sales"."estimates"("estimate_number");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_entries_customer_bp_id_product_id_order_type_key" ON "sales"."price_list_entries"("customer_bp_id", "product_id", "order_type");

-- CreateIndex
CREATE INDEX "price_list_tiers_price_list_entry_id_min_quantity_idx" ON "sales"."price_list_tiers"("price_list_entry_id", "min_quantity");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_quote_number_key" ON "sales"."quotes"("quote_number");

-- AddForeignKey
ALTER TABLE "auth"."user_role_relation" ADD CONSTRAINT "user_role_relation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."user_role_relation" ADD CONSTRAINT "user_role_relation_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "auth"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."user_role_relation" ADD CONSTRAINT "user_role_relation_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."role_permission_relation" ADD CONSTRAINT "role_permission_relation_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "auth"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."role_permission_relation" ADD CONSTRAINT "role_permission_relation_permission_code_fkey" FOREIGN KEY ("permission_code") REFERENCES "auth"."permissions"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bp"."business_partners" ADD CONSTRAINT "business_partners_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "bp"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bp"."business_partners" ADD CONSTRAINT "business_partners_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bp"."bp_role_assignments" ADD CONSTRAINT "bp_role_assignments_bp_id_fkey" FOREIGN KEY ("bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bp"."bp_customer_attrs" ADD CONSTRAINT "bp_customer_attrs_bp_id_fkey" FOREIGN KEY ("bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bp"."bp_customer_attrs" ADD CONSTRAINT "bp_customer_attrs_billing_bp_id_fkey" FOREIGN KEY ("billing_bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bp"."bp_contacts" ADD CONSTRAINT "bp_contacts_bp_id_fkey" FOREIGN KEY ("bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kot"."kot_match_review" ADD CONSTRAINT "kot_match_review_employee_code_fkey" FOREIGN KEY ("employee_code") REFERENCES "kot"."kot_employees"("employee_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kot"."hr_records" ADD CONSTRAINT "hr_records_employee_username_fkey" FOREIGN KEY ("employee_username") REFERENCES "kot"."employees"("username") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master"."materials" ADD CONSTRAINT "materials_material_type_id_fkey" FOREIGN KEY ("material_type_id") REFERENCES "master"."material_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master"."products" ADD CONSTRAINT "products_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "master"."materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "sales"."quotes" ADD CONSTRAINT "quotes_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."quotes" ADD CONSTRAINT "quotes_customer_branch_bp_id_fkey" FOREIGN KEY ("customer_branch_bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."quotes" ADD CONSTRAINT "quotes_pdf_file_id_fkey" FOREIGN KEY ("pdf_file_id") REFERENCES "sys"."files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."quotes" ADD CONSTRAINT "quotes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."quote_items" ADD CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "sales"."quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."quote_items" ADD CONSTRAINT "quote_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."quote_items" ADD CONSTRAINT "quote_items_price_list_tier_id_fkey" FOREIGN KEY ("price_list_tier_id") REFERENCES "sales"."price_list_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys"."files" ADD CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ── Extensions ────────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgroonga;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgroonga unavailable on this host — skipped (dev only; the production image ships it)';
END $$;

-- ── kot.v_labor — labor reporting view (Metabase 労務ダッシュボード) ──
CREATE VIEW "kot"."v_labor" AS
 SELECT h.date,
    h.employee_username AS username,
    COALESCE(ed.display_name, ke.name) AS employee_name,
    e.employee_code,
    ed.department,
    ed.title AS "position",
    ed.company,
    ed.is_active,
    h.wt_normal AS work_minutes,
    round((h.wt_normal)::numeric / 60.0, 2) AS work_hours,
    h.wt_overtime AS overtime_minutes,
    round((h.wt_overtime)::numeric / 60.0, 2) AS overtime_hours,
    h.wt_overtime_night AS overtime_night_minutes,
    h.wt_night AS night_allowance_minutes,
    h.wt_leave_late AS leave_late_minutes,
    h.pto AS pto_minutes,
    round((h.pto)::numeric / 60.0, 2) AS pto_hours,
    array_length(h.record_starts, 1) AS clock_in_count,
    h.plan_start,
    h.plan_end,
    h.record_starts,
    h.record_ends
   FROM "kot"."hr_records" h
     LEFT JOIN "kot"."employees" e ON e.username = h.employee_username
     LEFT JOIN "kot"."kot_employees" ke ON ke.employee_code = e.employee_code
     LEFT JOIN "directory"."employee_directory" ed ON ed.username = h.employee_username;

-- ── auth.user_permissions — highest scope per (user, action, permission) ──
-- Always query this view for RBAC, never the relation tables.
CREATE VIEW "auth"."user_permissions" AS
 SELECT DISTINCT ON (urr.user_id, rpr.action, rpr.permission_code)
    urr.user_id,
    rpr.action,
    rpr.permission_code,
    rpr.scope,
    rpr.scope_custom
   FROM "auth"."user_role_relation" urr
     JOIN "auth"."roles" r ON r.id = urr.role_id
     JOIN "auth"."role_permission_relation" rpr ON rpr.role_id = urr.role_id
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
