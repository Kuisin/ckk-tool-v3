-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "admintools";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auth";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "billing";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "bp";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "design";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "directory";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "inventory";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "kot";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "log";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "master";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "production";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "sales";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "shipping";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "sys";

-- CreateEnum
CREATE TYPE "auth"."USER_GROUP" AS ENUM ('SYSTEM', 'EMPLOYEE', 'GUEST');

-- CreateEnum
CREATE TYPE "auth"."ACTION" AS ENUM ('READ', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'APPROVE', 'ADMIN');

-- CreateEnum
CREATE TYPE "auth"."SCOPE" AS ENUM ('ALL', 'REGION', 'COUNTRY', 'FACTORY', 'DEPARTMENT', 'TEAM', 'SUB', 'OWN');

-- CreateEnum
CREATE TYPE "billing"."INVOICE_STATUS" AS ENUM ('DRAFT', 'ISSUED', 'SENT', 'PAID');

-- CreateEnum
CREATE TYPE "billing"."CLOSING_STATUS" AS ENUM ('PENDING', 'PROCESSED', 'EXPORTED');

-- CreateEnum
CREATE TYPE "bp"."BP_ROLE" AS ENUM ('CUSTOMER', 'VENDOR', 'END_USER');

-- CreateEnum
CREATE TYPE "bp"."VENDOR_TYPE" AS ENUM ('SUPPLIER', 'OUTSOURCE');

-- CreateEnum
CREATE TYPE "bp"."TAX_TYPE" AS ENUM ('TAXABLE', 'EXEMPT', 'REDUCED');

-- CreateEnum
CREATE TYPE "bp"."INVOICE_METHOD" AS ENUM ('EMAIL', 'FAX', 'POST', 'PORTAL');

-- CreateEnum
CREATE TYPE "design"."DESIGN_TRIGGER" AS ENUM ('QUOTE', 'SALES_ORDER');

-- CreateEnum
CREATE TYPE "design"."DESIGN_STATUS" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "inventory"."INVENTORY_TYPE" AS ENUM ('PRODUCT', 'MATERIAL');

-- CreateEnum
CREATE TYPE "inventory"."RESERVATION_STATUS" AS ENUM ('RESERVED', 'CONFIRMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "inventory"."TRANSACTION_TYPE" AS ENUM ('IN', 'OUT', 'RESERVE', 'RELEASE', 'ADJUST');

-- CreateEnum
CREATE TYPE "log"."SYNC_STATUS" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "master"."MATERIAL_FORM" AS ENUM ('POLISHED', 'STANDARD_LENGTH', 'SEMI_FINISHED', 'OTHER');

-- CreateEnum
CREATE TYPE "production"."SALES_ORDER_STATUS" AS ENUM ('DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'PARTIAL_SHIPPED', 'SHIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "production"."WORK_ORDER_TYPE" AS ENUM ('FROM_STOCK', 'MANUFACTURE');

-- CreateEnum
CREATE TYPE "production"."WORK_ORDER_STATUS" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "production"."WORK_ORDER_APPROVAL_STATUS" AS ENUM ('NONE', 'PENDING_1ST', 'APPROVED_1ST', 'PENDING_2ND', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "production"."PROCESS_CATEGORY" AS ENUM ('MATERIAL_PREP', 'MACHINING', 'COATING', 'INSPECTION', 'APPROVAL', 'SHIPPING');

-- CreateEnum
CREATE TYPE "production"."PROCESS_EXECUTION" AS ENUM ('INTERNAL', 'INTERNAL_OR_OUTSOURCE');

-- CreateEnum
CREATE TYPE "production"."DEPENDENCY_RELATION" AS ENUM ('AND', 'OR');

-- CreateEnum
CREATE TYPE "production"."STEP_EXECUTION" AS ENUM ('INTERNAL', 'OUTSOURCE');

-- CreateEnum
CREATE TYPE "production"."STEP_STATUS" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "production"."APPROVAL_GROUP_TYPE" AS ENUM ('FIRST', 'SECOND', 'WORKFLOW_CHANGE');

-- CreateEnum
CREATE TYPE "production"."APPROVAL_STEP" AS ENUM ('FIRST', 'SECOND');

-- CreateEnum
CREATE TYPE "production"."APPROVAL_REQUEST_STATUS" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "production"."APPROVAL_ACTION" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "production"."INSPECTION_STATUS" AS ENUM ('PENDING', 'PASS', 'FAIL', 'APPROVED');

-- CreateEnum
CREATE TYPE "sales"."ORDER_TYPE" AS ENUM ('PRODUCTION', 'TEST', 'SAMPLE', 'OTHER');

-- CreateEnum
CREATE TYPE "sales"."QUOTE_STATUS" AS ENUM ('DRAFT', 'ISSUED', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "sales"."ORDER_ACCEPTANCE_STATUS" AS ENUM ('PENDING', 'PRICE_DIFF', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "shipping"."SHIPPING_TYPE" AS ENUM ('STOCK_STORAGE', 'DISPATCH');

-- CreateEnum
CREATE TYPE "shipping"."SHIPPING_STATUS" AS ENUM ('DRAFT', 'CONFIRMED', 'SHIPPED');

-- CreateEnum
CREATE TYPE "shipping"."DELIVERY_METHOD" AS ENUM ('DIRECT_TO_USER', 'NORMAL');

-- CreateEnum
CREATE TYPE "shipping"."DELIVERY_STATUS" AS ENUM ('DRAFT', 'ISSUED', 'DELIVERED');

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
CREATE TABLE "billing"."invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_number" TEXT NOT NULL,
    "customer_bp_id" UUID NOT NULL,
    "customer_branch_bp_id" UUID,
    "billing_period_from" DATE NOT NULL,
    "billing_period_to" DATE NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "status" "billing"."INVOICE_STATUS" NOT NULL DEFAULT 'DRAFT',
    "issued_at" TIMESTAMPTZ(6),
    "due_date" DATE,
    "sent_at" TIMESTAMPTZ(6),
    "pdf_file_id" UUID,
    "yayoi_exported_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing"."invoice_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "shipping_order_id" UUID,
    "delivery_note_id" UUID,
    "description" JSONB NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing"."billing_closings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_bp_id" UUID NOT NULL,
    "closing_date" DATE NOT NULL,
    "status" "billing"."CLOSING_STATUS" NOT NULL DEFAULT 'PENDING',
    "total_amount" DECIMAL(12,2),
    "processed_at" TIMESTAMPTZ(6),
    "processed_by" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_closings_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "bp"."bp_vendor_attrs" (
    "bp_id" UUID NOT NULL,
    "vendor_code" TEXT,
    "vendor_type" "bp"."VENDOR_TYPE" NOT NULL,
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
CREATE TABLE "bp"."bp_end_user_attrs" (
    "bp_id" UUID NOT NULL,
    "industry" TEXT,
    "notes" TEXT,

    CONSTRAINT "bp_end_user_attrs_pkey" PRIMARY KEY ("bp_id")
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
CREATE TABLE "design"."design_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_number" TEXT NOT NULL,
    "trigger" "design"."DESIGN_TRIGGER" NOT NULL,
    "quote_id" UUID,
    "sales_order_id" UUID,
    "product_id" TEXT,
    "description" TEXT,
    "status" "design"."DESIGN_STATUS" NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "design_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design"."design_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "design_request_id" UUID,
    "product_id" TEXT,
    "file_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_latest" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_files_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "inventory"."product_inventory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" TEXT NOT NULL,
    "lot_number" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT,
    "notes" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."material_inventory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "material_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reserved_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "material_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."inventory_reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inventory_type" "inventory"."INVENTORY_TYPE" NOT NULL,
    "inventory_id" UUID NOT NULL,
    "sales_order_id" UUID,
    "work_order_id" UUID,
    "quantity" DECIMAL(12,3) NOT NULL,
    "status" "inventory"."RESERVATION_STATUS" NOT NULL DEFAULT 'RESERVED',
    "reserved_at" TIMESTAMPTZ(6),
    "confirmed_at" TIMESTAMPTZ(6),
    "released_at" TIMESTAMPTZ(6),

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."inventory_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inventory_type" "inventory"."INVENTORY_TYPE" NOT NULL,
    "inventory_id" UUID NOT NULL,
    "transaction_type" "inventory"."TRANSACTION_TYPE" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "reference_type" TEXT,
    "reference_id" UUID,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."material_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "material_id" TEXT NOT NULL,
    "supplier_bp_id" UUID,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "received_at" DATE NOT NULL,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_receipts_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "log"."system_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "action" TEXT,
    "resource" TEXT,
    "resource_id" TEXT,
    "status" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log"."audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID,
    "action" TEXT,
    "table_name" TEXT,
    "record_id" UUID,
    "before_data" JSONB,
    "after_data" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log"."ad_sync_logs" (
    "id" SERIAL NOT NULL,
    "sync_type" TEXT NOT NULL,
    "status" "log"."SYNC_STATUS" NOT NULL,
    "total_records" INTEGER,
    "created_count" INTEGER,
    "updated_count" INTEGER,
    "deactivated_count" INTEGER,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "ad_sync_logs_pkey" PRIMARY KEY ("id")
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
    "design_file_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production"."sales_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sales_order_number" TEXT NOT NULL,
    "order_acceptance_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "lot_number" INTEGER,
    "order_type" "sales"."ORDER_TYPE" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "delivery_date" DATE,
    "status" "production"."SALES_ORDER_STATUS" NOT NULL DEFAULT 'DRAFT',
    "end_user_bp_id" UUID,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production"."work_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_number" INTEGER NOT NULL,
    "sales_order_id" UUID NOT NULL,
    "type" "production"."WORK_ORDER_TYPE" NOT NULL,
    "planned_quantity" INTEGER NOT NULL,
    "material_id" TEXT,
    "status" "production"."WORK_ORDER_STATUS" NOT NULL DEFAULT 'DRAFT',
    "approval_status" "production"."WORK_ORDER_APPROVAL_STATUS" NOT NULL DEFAULT 'NONE',
    "source_work_order_id" UUID,
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
CREATE TABLE "production"."work_order_inspection_templates" (
    "work_order_id" UUID NOT NULL,
    "inspection_template_id" UUID NOT NULL,

    CONSTRAINT "work_order_inspection_templates_pkey" PRIMARY KEY ("work_order_id","inspection_template_id")
);

-- CreateTable
CREATE TABLE "production"."process_step_catalog" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "category" "production"."PROCESS_CATEGORY" NOT NULL,
    "execution_location" "production"."PROCESS_EXECUTION" NOT NULL,
    "is_sync_capable" BOOLEAN NOT NULL DEFAULT false,
    "is_inspection" BOOLEAN NOT NULL DEFAULT false,
    "is_approval_step" BOOLEAN NOT NULL DEFAULT false,
    "approval_min_rank" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "process_step_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production"."process_step_use_dependencies" (
    "step_id" INTEGER NOT NULL,
    "depends_on_step_id" INTEGER NOT NULL,
    "relation" "production"."DEPENDENCY_RELATION" NOT NULL DEFAULT 'AND',
    "is_negation" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "process_step_use_dependencies_pkey" PRIMARY KEY ("step_id","depends_on_step_id")
);

-- CreateTable
CREATE TABLE "production"."process_step_exec_dependencies" (
    "step_id" INTEGER NOT NULL,
    "depends_on_step_id" INTEGER NOT NULL,
    "relation" "production"."DEPENDENCY_RELATION" NOT NULL DEFAULT 'AND',
    "notes" TEXT,

    CONSTRAINT "process_step_exec_dependencies_pkey" PRIMARY KEY ("step_id","depends_on_step_id")
);

-- CreateTable
CREATE TABLE "production"."work_order_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL,
    "process_step_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "execution_location" "production"."STEP_EXECUTION" NOT NULL,
    "supplier_bp_id" UUID,
    "outsource_requested_at" DATE,
    "outsource_expected_at" DATE,
    "outsource_received_at" DATE,
    "status" "production"."STEP_STATUS" NOT NULL DEFAULT 'PENDING',
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
CREATE TABLE "production"."approval_groups" (
    "id" SERIAL NOT NULL,
    "type" "production"."APPROVAL_GROUP_TYPE" NOT NULL,
    "name" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "approval_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production"."approval_group_members" (
    "group_id" INTEGER NOT NULL,
    "user_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "approval_group_members_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateTable
CREATE TABLE "production"."approval_delegates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" INTEGER NOT NULL,
    "delegator_id" UUID NOT NULL,
    "delegate_id" UUID NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_delegates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production"."approval_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL,
    "step" "production"."APPROVAL_STEP" NOT NULL,
    "status" "production"."APPROVAL_REQUEST_STATUS" NOT NULL DEFAULT 'PENDING',
    "requested_by" UUID,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production"."approval_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "approval_request_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "delegate_for_id" UUID,
    "action" "production"."APPROVAL_ACTION" NOT NULL,
    "comment" TEXT,
    "acted_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "approval_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production"."inspection_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "related_process_step_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inspection_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production"."inspection_template_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "item_name" JSONB NOT NULL,
    "unit" TEXT,
    "tolerance_min" DECIMAL,
    "tolerance_max" DECIMAL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inspection_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production"."inspection_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_step_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "status" "production"."INSPECTION_STATUS" NOT NULL DEFAULT 'PENDING',
    "recorded_by" UUID,
    "approved_by" UUID,
    "recorded_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "notes" TEXT,

    CONSTRAINT "inspection_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production"."inspection_record_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inspection_record_id" UUID NOT NULL,
    "template_item_id" UUID NOT NULL,
    "measured_value" TEXT,
    "is_pass" BOOLEAN,
    "notes" TEXT,

    CONSTRAINT "inspection_record_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production"."defect_types" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "defect_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production"."defect_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_step_id" UUID NOT NULL,
    "defect_type_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "recorded_by" UUID,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "defect_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."price_lists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_bp_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "order_type" "sales"."ORDER_TYPE" NOT NULL,
    "min_quantity" INTEGER NOT NULL DEFAULT 1,
    "max_quantity" INTEGER,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
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
    "price_list_id" UUID,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL,
    "delivery_date" DATE,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."order_acceptances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_number" TEXT NOT NULL,
    "quote_id" UUID,
    "customer_bp_id" UUID NOT NULL,
    "customer_branch_bp_id" UUID,
    "customer_order_ref" TEXT,
    "status" "sales"."ORDER_ACCEPTANCE_STATUS" NOT NULL DEFAULT 'PENDING',
    "total_amount" DECIMAL(12,2),
    "order_doc_file_id" UUID,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping"."shipping_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sales_order_id" UUID NOT NULL,
    "work_order_id" UUID,
    "type" "shipping"."SHIPPING_TYPE" NOT NULL,
    "status" "shipping"."SHIPPING_STATUS" NOT NULL DEFAULT 'DRAFT',
    "shipped_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shipping_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping"."shipping_order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shipping_order_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "lot_number" INTEGER,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shipping_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping"."delivery_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "delivery_number" TEXT NOT NULL,
    "shipping_order_id" UUID NOT NULL,
    "delivery_method" "shipping"."DELIVERY_METHOD" NOT NULL,
    "recipient_bp_id" UUID NOT NULL,
    "recipient_branch_bp_id" UUID,
    "end_user_bp_id" UUID,
    "include_price" BOOLEAN NOT NULL DEFAULT true,
    "pdf_file_id" UUID,
    "status" "shipping"."DELIVERY_STATUS" NOT NULL DEFAULT 'DRAFT',
    "delivered_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "delivery_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping"."delivery_note_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "delivery_note_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2),
    "amount" DECIMAL(12,2),
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "delivery_note_items_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "sys"."feature_flags" (
    "key" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
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
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "billing"."invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "business_partners_bp_code_key" ON "bp"."business_partners"("bp_code");

-- CreateIndex
CREATE INDEX "business_partners_parent_id_idx" ON "bp"."business_partners"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "bp_role_assignments_bp_id_role_key" ON "bp"."bp_role_assignments"("bp_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "bp_customer_attrs_customer_code_key" ON "bp"."bp_customer_attrs"("customer_code");

-- CreateIndex
CREATE UNIQUE INDEX "bp_vendor_attrs_vendor_code_key" ON "bp"."bp_vendor_attrs"("vendor_code");

-- CreateIndex
CREATE INDEX "bp_contacts_bp_id_idx" ON "bp"."bp_contacts"("bp_id");

-- CreateIndex
CREATE UNIQUE INDEX "design_requests_request_number_key" ON "design"."design_requests"("request_number");

-- CreateIndex
CREATE INDEX "idx_ldap_sync_log_finished" ON "directory"."ldap_sync_log"("finished_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "employees_username_key" ON "kot"."employees"("username");

-- CreateIndex
CREATE INDEX "idx_hr_records_zone_date" ON "kot"."hr_records"("zone", "date");

-- CreateIndex
CREATE UNIQUE INDEX "uq_hr_records" ON "kot"."hr_records"("employee_username", "zone", "date");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_sales_order_number_key" ON "production"."sales_orders"("sales_order_number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_lot_number_key" ON "production"."sales_orders"("lot_number");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_work_order_number_key" ON "production"."work_orders"("work_order_number");

-- CreateIndex
CREATE UNIQUE INDEX "process_step_catalog_code_key" ON "production"."process_step_catalog"("code");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_templates_code_key" ON "production"."inspection_templates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "defect_types_code_key" ON "production"."defect_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_quote_number_key" ON "sales"."quotes"("quote_number");

-- CreateIndex
CREATE UNIQUE INDEX "order_acceptances_order_number_key" ON "sales"."order_acceptances"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_notes_delivery_number_key" ON "shipping"."delivery_notes"("delivery_number");

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
ALTER TABLE "billing"."invoices" ADD CONSTRAINT "invoices_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."invoices" ADD CONSTRAINT "invoices_customer_branch_bp_id_fkey" FOREIGN KEY ("customer_branch_bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."invoices" ADD CONSTRAINT "invoices_pdf_file_id_fkey" FOREIGN KEY ("pdf_file_id") REFERENCES "sys"."files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."invoices" ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "billing"."invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."invoice_items" ADD CONSTRAINT "invoice_items_shipping_order_id_fkey" FOREIGN KEY ("shipping_order_id") REFERENCES "shipping"."shipping_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."invoice_items" ADD CONSTRAINT "invoice_items_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "shipping"."delivery_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."billing_closings" ADD CONSTRAINT "billing_closings_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."billing_closings" ADD CONSTRAINT "billing_closings_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "bp"."bp_vendor_attrs" ADD CONSTRAINT "bp_vendor_attrs_bp_id_fkey" FOREIGN KEY ("bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bp"."bp_end_user_attrs" ADD CONSTRAINT "bp_end_user_attrs_bp_id_fkey" FOREIGN KEY ("bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bp"."bp_contacts" ADD CONSTRAINT "bp_contacts_bp_id_fkey" FOREIGN KEY ("bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design"."design_requests" ADD CONSTRAINT "design_requests_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "sales"."quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design"."design_requests" ADD CONSTRAINT "design_requests_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "production"."sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design"."design_requests" ADD CONSTRAINT "design_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master"."products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design"."design_requests" ADD CONSTRAINT "design_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design"."design_files" ADD CONSTRAINT "design_files_design_request_id_fkey" FOREIGN KEY ("design_request_id") REFERENCES "design"."design_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design"."design_files" ADD CONSTRAINT "design_files_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master"."products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design"."design_files" ADD CONSTRAINT "design_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "sys"."files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design"."design_files" ADD CONSTRAINT "design_files_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."product_inventory" ADD CONSTRAINT "product_inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."product_inventory" ADD CONSTRAINT "product_inventory_lot_number_fkey" FOREIGN KEY ("lot_number") REFERENCES "production"."work_orders"("work_order_number") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."material_inventory" ADD CONSTRAINT "material_inventory_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "master"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."inventory_reservations" ADD CONSTRAINT "inventory_reservations_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "production"."sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."inventory_reservations" ADD CONSTRAINT "inventory_reservations_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "production"."work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."inventory_transactions" ADD CONSTRAINT "inventory_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."material_receipts" ADD CONSTRAINT "material_receipts_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "master"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."material_receipts" ADD CONSTRAINT "material_receipts_supplier_bp_id_fkey" FOREIGN KEY ("supplier_bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."material_receipts" ADD CONSTRAINT "material_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kot"."kot_match_review" ADD CONSTRAINT "kot_match_review_employee_code_fkey" FOREIGN KEY ("employee_code") REFERENCES "kot"."kot_employees"("employee_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kot"."hr_records" ADD CONSTRAINT "hr_records_employee_username_fkey" FOREIGN KEY ("employee_username") REFERENCES "kot"."employees"("username") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master"."materials" ADD CONSTRAINT "materials_material_type_id_fkey" FOREIGN KEY ("material_type_id") REFERENCES "master"."material_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master"."products" ADD CONSTRAINT "products_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "master"."materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master"."products" ADD CONSTRAINT "products_design_file_id_fkey" FOREIGN KEY ("design_file_id") REFERENCES "design"."design_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."sales_orders" ADD CONSTRAINT "sales_orders_order_acceptance_id_fkey" FOREIGN KEY ("order_acceptance_id") REFERENCES "sales"."order_acceptances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."sales_orders" ADD CONSTRAINT "sales_orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."sales_orders" ADD CONSTRAINT "sales_orders_end_user_bp_id_fkey" FOREIGN KEY ("end_user_bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."sales_orders" ADD CONSTRAINT "sales_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."work_orders" ADD CONSTRAINT "work_orders_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "production"."sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."work_orders" ADD CONSTRAINT "work_orders_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "master"."materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."work_orders" ADD CONSTRAINT "work_orders_source_work_order_id_fkey" FOREIGN KEY ("source_work_order_id") REFERENCES "production"."work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."work_orders" ADD CONSTRAINT "work_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."work_order_inspection_templates" ADD CONSTRAINT "work_order_inspection_templates_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "production"."work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."work_order_inspection_templates" ADD CONSTRAINT "work_order_inspection_templates_inspection_template_id_fkey" FOREIGN KEY ("inspection_template_id") REFERENCES "production"."inspection_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."process_step_use_dependencies" ADD CONSTRAINT "process_step_use_dependencies_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "production"."process_step_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."process_step_use_dependencies" ADD CONSTRAINT "process_step_use_dependencies_depends_on_step_id_fkey" FOREIGN KEY ("depends_on_step_id") REFERENCES "production"."process_step_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."process_step_exec_dependencies" ADD CONSTRAINT "process_step_exec_dependencies_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "production"."process_step_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."process_step_exec_dependencies" ADD CONSTRAINT "process_step_exec_dependencies_depends_on_step_id_fkey" FOREIGN KEY ("depends_on_step_id") REFERENCES "production"."process_step_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."work_order_steps" ADD CONSTRAINT "work_order_steps_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "production"."work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."work_order_steps" ADD CONSTRAINT "work_order_steps_process_step_id_fkey" FOREIGN KEY ("process_step_id") REFERENCES "production"."process_step_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."work_order_steps" ADD CONSTRAINT "work_order_steps_supplier_bp_id_fkey" FOREIGN KEY ("supplier_bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."work_order_steps" ADD CONSTRAINT "work_order_steps_session_locked_by_fkey" FOREIGN KEY ("session_locked_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."work_order_steps" ADD CONSTRAINT "work_order_steps_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."work_order_steps" ADD CONSTRAINT "work_order_steps_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."work_order_steps" ADD CONSTRAINT "work_order_steps_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."approval_group_members" ADD CONSTRAINT "approval_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "production"."approval_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."approval_group_members" ADD CONSTRAINT "approval_group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."approval_delegates" ADD CONSTRAINT "approval_delegates_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "production"."approval_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."approval_delegates" ADD CONSTRAINT "approval_delegates_delegator_id_fkey" FOREIGN KEY ("delegator_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."approval_delegates" ADD CONSTRAINT "approval_delegates_delegate_id_fkey" FOREIGN KEY ("delegate_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."approval_delegates" ADD CONSTRAINT "approval_delegates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."approval_requests" ADD CONSTRAINT "approval_requests_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "production"."work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."approval_requests" ADD CONSTRAINT "approval_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."approval_records" ADD CONSTRAINT "approval_records_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "production"."approval_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."approval_records" ADD CONSTRAINT "approval_records_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."approval_records" ADD CONSTRAINT "approval_records_delegate_for_id_fkey" FOREIGN KEY ("delegate_for_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."inspection_templates" ADD CONSTRAINT "inspection_templates_related_process_step_id_fkey" FOREIGN KEY ("related_process_step_id") REFERENCES "production"."process_step_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."inspection_template_items" ADD CONSTRAINT "inspection_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "production"."inspection_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."inspection_records" ADD CONSTRAINT "inspection_records_work_order_step_id_fkey" FOREIGN KEY ("work_order_step_id") REFERENCES "production"."work_order_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."inspection_records" ADD CONSTRAINT "inspection_records_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "production"."inspection_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."inspection_records" ADD CONSTRAINT "inspection_records_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."inspection_records" ADD CONSTRAINT "inspection_records_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."inspection_record_items" ADD CONSTRAINT "inspection_record_items_inspection_record_id_fkey" FOREIGN KEY ("inspection_record_id") REFERENCES "production"."inspection_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."inspection_record_items" ADD CONSTRAINT "inspection_record_items_template_item_id_fkey" FOREIGN KEY ("template_item_id") REFERENCES "production"."inspection_template_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."defect_records" ADD CONSTRAINT "defect_records_work_order_step_id_fkey" FOREIGN KEY ("work_order_step_id") REFERENCES "production"."work_order_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."defect_records" ADD CONSTRAINT "defect_records_defect_type_id_fkey" FOREIGN KEY ("defect_type_id") REFERENCES "production"."defect_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production"."defect_records" ADD CONSTRAINT "defect_records_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."price_lists" ADD CONSTRAINT "price_lists_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."price_lists" ADD CONSTRAINT "price_lists_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."price_lists" ADD CONSTRAINT "price_lists_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "sales"."quote_items" ADD CONSTRAINT "quote_items_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "sales"."price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_acceptances" ADD CONSTRAINT "order_acceptances_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "sales"."quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_acceptances" ADD CONSTRAINT "order_acceptances_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_acceptances" ADD CONSTRAINT "order_acceptances_customer_branch_bp_id_fkey" FOREIGN KEY ("customer_branch_bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_acceptances" ADD CONSTRAINT "order_acceptances_order_doc_file_id_fkey" FOREIGN KEY ("order_doc_file_id") REFERENCES "sys"."files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_acceptances" ADD CONSTRAINT "order_acceptances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping"."shipping_orders" ADD CONSTRAINT "shipping_orders_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "production"."sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping"."shipping_orders" ADD CONSTRAINT "shipping_orders_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "production"."work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping"."shipping_orders" ADD CONSTRAINT "shipping_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping"."shipping_order_items" ADD CONSTRAINT "shipping_order_items_shipping_order_id_fkey" FOREIGN KEY ("shipping_order_id") REFERENCES "shipping"."shipping_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping"."shipping_order_items" ADD CONSTRAINT "shipping_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping"."delivery_notes" ADD CONSTRAINT "delivery_notes_shipping_order_id_fkey" FOREIGN KEY ("shipping_order_id") REFERENCES "shipping"."shipping_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping"."delivery_notes" ADD CONSTRAINT "delivery_notes_recipient_bp_id_fkey" FOREIGN KEY ("recipient_bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping"."delivery_notes" ADD CONSTRAINT "delivery_notes_recipient_branch_bp_id_fkey" FOREIGN KEY ("recipient_branch_bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping"."delivery_notes" ADD CONSTRAINT "delivery_notes_end_user_bp_id_fkey" FOREIGN KEY ("end_user_bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping"."delivery_notes" ADD CONSTRAINT "delivery_notes_pdf_file_id_fkey" FOREIGN KEY ("pdf_file_id") REFERENCES "sys"."files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping"."delivery_notes" ADD CONSTRAINT "delivery_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping"."delivery_note_items" ADD CONSTRAINT "delivery_note_items_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "shipping"."delivery_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping"."delivery_note_items" ADD CONSTRAINT "delivery_note_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys"."files" ADD CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys"."feature_flags" ADD CONSTRAINT "feature_flags_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Extensions ────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgroonga;

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
