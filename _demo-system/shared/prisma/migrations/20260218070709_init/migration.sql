-- CreateEnum
CREATE TYPE "Zone" AS ENUM ('JPN', 'CHN', 'SEA', 'EUR');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING', 'ORDERED', 'COMPLETED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('JPY', 'USD', 'EUR', 'CNY', 'THB');

-- CreateEnum
CREATE TYPE "ShippingInstructionType" AS ENUM ('USER_DIRECT', 'NORMAL_DELIVERY', 'STOCK');

-- CreateEnum
CREATE TYPE "ShippingInstructionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'REQUESTED', 'APPROVED', 'ORDERED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockReservationStatus" AS ENUM ('RESERVED', 'LOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockTransactionType" AS ENUM ('CUT', 'USE', 'DAMAGED', 'DISCARD', 'DEFECTIVE', 'STOCK_TAKE', 'OVERRIDE', 'MOVE', 'PURCHASE');

-- CreateEnum
CREATE TYPE "ProcessPlanStatus" AS ENUM ('DRAFT', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProcessRecordType" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProcessTemplateSpecialKind" AS ENUM ('NONE', 'INITIAL', 'FINAL');

-- CreateEnum
CREATE TYPE "ProcessTemplateStepKind" AS ENUM ('MATERIAL_FROM_STOCK', 'SEMI_FROM_STOCK', 'MATERIAL_HANDOVER', 'PRODUCT_HANDOVER', 'PROCESSING', 'PRE_SHIPMENT_INSPECTION', 'SHIPMENT', 'INTER_FACTORY_DELIVERY');

-- CreateEnum
CREATE TYPE "LogCategory" AS ENUM ('AUTH', 'SYSTEM', 'SECURITY', 'CARD', 'AUDIT', 'ERROR');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "GroupSource" AS ENUM ('AD', 'APP');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'REVOKED', 'SUSPENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'MANAGE', 'FORCE', 'ACCESS', 'PRINT', 'EXPORT', 'REQUEST', 'APPROVE', 'ORDER', 'LOCK', 'COMPLETE', 'CANCEL', 'CUT');

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('ALL', 'OWN', 'DEPARTMENT', 'TEAM', 'GROUP', 'ZONE', 'NONE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AccessType" AS ENUM ('KIOSK', 'WEB', 'BOTH');

-- CreateTable
CREATE TABLE "auth_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_order_receipts" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL,
    "employee_username" TEXT NOT NULL,
    "order_date" TIMESTAMPTZ NOT NULL,
    "delivery_date" TIMESTAMPTZ NOT NULL,
    "total_amount" DECIMAL(65,30) DEFAULT 0,
    "notes" TEXT,
    "external_doc_ref" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_order_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_orders" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "zone" "Zone" NOT NULL DEFAULT 'JPN',
    "order_receipt_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "ordered_quantity" INTEGER NOT NULL DEFAULT 0,
    "total_quantity" INTEGER NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'JPY',
    "unit_price" DECIMAL(65,30) DEFAULT 0,
    "total_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status_changed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" TEXT,
    "cancellation_reason" TEXT,
    "archived_at" TIMESTAMPTZ,
    "archived_by" TEXT,
    "completed_at" TIMESTAMPTZ,
    "end_user_id" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "app_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_manufacturing_workflows" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "name" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "planned_quantity" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "app_manufacturing_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_workflow_links" (
    "id" SERIAL NOT NULL,
    "source_workflow_id" INTEGER NOT NULL,
    "target_workflow_id" INTEGER NOT NULL,
    "split_after_plan_id" INTEGER,
    "routed_quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "app_workflow_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_products" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "is_parent" BOOLEAN NOT NULL DEFAULT false,
    "inherited_from" INTEGER,
    "material_id" INTEGER NOT NULL,
    "shape" TEXT,
    "classification" TEXT,
    "material_nominal_diameter" INTEGER,
    "material_length" INTEGER,
    "blade_count" INTEGER,
    "coating_type" TEXT,
    "spec_memo" TEXT,
    "3d_file_path" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "app_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_materials" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "mfr_code" TEXT,
    "mfr_grade_code" INTEGER,
    "shape_code" TEXT,
    "type_code" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "app_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_stock_purchases" (
    "id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "purchase_date" TIMESTAMPTZ NOT NULL,
    "invoice_number" TEXT,
    "purchase_order_number" TEXT,
    "employee_username" TEXT NOT NULL,
    "total_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'JPY',
    "notes" TEXT,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "status_changed_at" TIMESTAMPTZ,
    "requested_at" TIMESTAMPTZ,
    "requested_by" TEXT,
    "approved_at" TIMESTAMPTZ,
    "approved_by" TEXT,
    "ordered_at" TIMESTAMPTZ,
    "ordered_by" TEXT,
    "completed_at" TIMESTAMPTZ,
    "completed_by" TEXT,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" TEXT,
    "cancellation_reason" TEXT,
    "history" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_stock_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_stock_purchase_items" (
    "id" SERIAL NOT NULL,
    "stock_purchase_id" INTEGER NOT NULL,
    "material_id" INTEGER NOT NULL,
    "factory_id" INTEGER NOT NULL,
    "diameter" DECIMAL(65,30) NOT NULL,
    "nominal_diameter" DECIMAL(65,30),
    "length" DECIMAL(65,30) NOT NULL,
    "polished" BOOLEAN NOT NULL DEFAULT false,
    "custom_type" TEXT NOT NULL DEFAULT '-',
    "quantity" INTEGER NOT NULL,
    "price_per_piece" DECIMAL(65,30) NOT NULL,
    "price_per_unit" DECIMAL(65,30),
    "currency" "Currency" NOT NULL DEFAULT 'JPY',
    "stock_transaction_id" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_stock_purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_stock_purchase_approvers" (
    "id" SERIAL NOT NULL,
    "stock_purchase_id" INTEGER NOT NULL,
    "group_id" INTEGER,
    "employee_username" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_stock_purchase_approvers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_stocks" (
    "id" SERIAL NOT NULL,
    "material_id" INTEGER NOT NULL,
    "diameter" DECIMAL(65,30) NOT NULL,
    "nominal_diameter" DECIMAL(65,30),
    "length" DECIMAL(65,30) NOT NULL,
    "polished" BOOLEAN NOT NULL DEFAULT false,
    "custom_type" TEXT NOT NULL DEFAULT '-',
    "factory_id" INTEGER NOT NULL,
    "available_quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_stock_reservations" (
    "id" SERIAL NOT NULL,
    "material_id" INTEGER NOT NULL,
    "diameter" DECIMAL(65,30) NOT NULL,
    "length" DECIMAL(65,30) NOT NULL,
    "polished" BOOLEAN NOT NULL DEFAULT false,
    "custom_type" TEXT NOT NULL DEFAULT '-',
    "factory_id" INTEGER,
    "direction" BOOLEAN NOT NULL DEFAULT false,
    "quantity" INTEGER NOT NULL,
    "order_id" INTEGER,
    "stock_purchase_id" INTEGER,
    "status" "StockReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "reserved_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_stock_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_stock_transactions" (
    "id" SERIAL NOT NULL,
    "material_id" INTEGER NOT NULL,
    "diameter" DECIMAL(65,30) NOT NULL,
    "length" DECIMAL(65,30) NOT NULL,
    "polished" BOOLEAN NOT NULL DEFAULT false,
    "custom_type" TEXT NOT NULL DEFAULT '-',
    "factory_id" INTEGER,
    "usage_location" TEXT,
    "linked_transaction_id" INTEGER,
    "transaction_type" "StockTransactionType" NOT NULL,
    "direction" BOOLEAN NOT NULL DEFAULT false,
    "quantity" INTEGER,
    "quantity_before" INTEGER NOT NULL,
    "quantity_after" INTEGER NOT NULL,
    "order_id" INTEGER,
    "reservation_id" INTEGER,
    "employee_username" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_stock_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_process_templates" (
    "id" SERIAL NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "on_start_logic_key" TEXT,
    "on_complete_logic_key" TEXT,
    "custom_view_logic_key" TEXT,
    "hide_button" BOOLEAN NOT NULL DEFAULT false,
    "step_kind" "ProcessTemplateStepKind" NOT NULL DEFAULT 'PROCESSING',
    "is_skippable_inspection" BOOLEAN NOT NULL DEFAULT false,
    "is_special" "ProcessTemplateSpecialKind" NOT NULL DEFAULT 'NONE',
    "required_exist_template_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "required_before_template_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "requirements_warning" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "app_process_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_process_plans" (
    "id" SERIAL NOT NULL,
    "workflow_id" INTEGER,
    "template_id" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "factory_id" INTEGER,
    "from_factory_id" INTEGER,
    "to_factory_id" INTEGER,
    "planned_at" TIMESTAMPTZ,
    "assigned_to" TEXT,
    "estimated_hours" DOUBLE PRECISION,
    "notes" TEXT,
    "skip_inspection" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProcessPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "status_changed_at" TIMESTAMPTZ,
    "marked_complete" BOOLEAN NOT NULL DEFAULT false,
    "marked_complete_at" TIMESTAMPTZ,
    "marked_complete_by" TEXT,
    "input_quantity" INTEGER,
    "output_success_quantity" INTEGER,
    "output_defect_semi_finished" INTEGER,
    "output_defect_scrap" INTEGER,
    "output_defect_rework" INTEGER,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" TEXT,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "app_process_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_process_records" (
    "id" SERIAL NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "type" "ProcessRecordType" NOT NULL DEFAULT 'IN_PROGRESS',
    "start_at" TIMESTAMPTZ NOT NULL,
    "end_at" TIMESTAMPTZ,
    "achieved_by" TEXT NOT NULL,
    "notes" TEXT,
    "logic_result" JSONB,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "app_process_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_factories" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_pho" TEXT,
    "postal_code" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "contact_person" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "zone" "Zone" NOT NULL DEFAULT 'JPN',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "app_factories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_machines" (
    "id" SERIAL NOT NULL,
    "manufacturer" TEXT,
    "type" TEXT,
    "model_number" TEXT,
    "factory_id" INTEGER NOT NULL,
    "location" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "app_machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_machine_programs" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "processing_location" TEXT,
    "execution_time_minutes" INTEGER,
    "program_file_path" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "app_machine_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_machine_program_step_templates" (
    "id" SERIAL NOT NULL,
    "machine_program_id" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "sort_order" INTEGER,

    CONSTRAINT "app_machine_program_step_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_machine_program_machines" (
    "machine_program_id" INTEGER NOT NULL,
    "machine_id" INTEGER NOT NULL,

    CONSTRAINT "app_machine_program_machines_pkey" PRIMARY KEY ("machine_program_id","machine_id")
);

-- CreateTable
CREATE TABLE "app_inspection_programs" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "execution_time_minutes" INTEGER,
    "program_file_path" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "app_inspection_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_inspection_program_step_templates" (
    "id" SERIAL NOT NULL,
    "inspection_program_id" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "sort_order" INTEGER,

    CONSTRAINT "app_inspection_program_step_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_inspection_program_machines" (
    "inspection_program_id" INTEGER NOT NULL,
    "machine_id" INTEGER NOT NULL,

    CONSTRAINT "app_inspection_program_machines_pkey" PRIMARY KEY ("inspection_program_id","machine_id")
);

-- CreateTable
CREATE TABLE "app_companies" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_pho" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "zone" "Zone" NOT NULL DEFAULT 'JPN',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "app_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_customers" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "company_id" INTEGER,
    "branch_name" TEXT,
    "name" TEXT NOT NULL,
    "name_pho" TEXT,
    "postal_code" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "contact_person" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "zone" "Zone" NOT NULL DEFAULT 'JPN',
    "can_be_purchase_customer" BOOLEAN NOT NULL DEFAULT true,
    "can_be_end_user" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "app_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_addresses" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "label" TEXT,
    "postal_code" TEXT,
    "prefecture" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "phone" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_shipping_instructions" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "type" "ShippingInstructionType" NOT NULL,
    "status" "ShippingInstructionStatus" NOT NULL DEFAULT 'PLANNED',
    "planned_quantity" INTEGER,
    "result_quantity" INTEGER,
    "from_factory_id" INTEGER,
    "to_factory_id" INTEGER,
    "to_address_id" INTEGER,
    "invoice_to_address_id" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "app_shipping_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_suppliers" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_pho" TEXT,
    "postal_code" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "contact_person" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "zone" "Zone" NOT NULL DEFAULT 'JPN',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "app_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs" (
    "id" SERIAL NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "employee_username" TEXT,
    "category" "LogCategory" NOT NULL,
    "type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "data" JSONB,
    "zone" "Zone" NOT NULL DEFAULT 'JPN',
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "department" TEXT,
    "title" TEXT,
    "manager" TEXT,
    "avatar_image" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "max_qr_codes" INTEGER NOT NULL DEFAULT 1,
    "max_concurrent_devices" INTEGER NOT NULL DEFAULT 3,
    "last_synced_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "last_active_at" TIMESTAMPTZ,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("username")
);

-- CreateTable
CREATE TABLE "guests" (
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "department" TEXT,
    "title" TEXT,
    "manager" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "max_qr_codes" INTEGER NOT NULL DEFAULT 1,
    "max_concurrent_devices" INTEGER NOT NULL DEFAULT 3,
    "zone" "Zone" NOT NULL DEFAULT 'JPN',
    "last_synced_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("username")
);

-- CreateTable
CREATE TABLE "settings_employees" (
    "id" SERIAL NOT NULL,
    "employee_username" TEXT NOT NULL,
    "kiosk_app" JSONB,
    "user_app" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_guests" (
    "id" SERIAL NOT NULL,
    "guest_username" TEXT NOT NULL,
    "kiosk_app" JSONB,
    "user_app" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT,
    "description" TEXT,
    "source" "GroupSource" NOT NULL DEFAULT 'APP',
    "ad_group_dn" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "zone" "Zone" NOT NULL DEFAULT 'JPN',
    "last_synced_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_group_memberships" (
    "id" SERIAL NOT NULL,
    "employee_username" TEXT NOT NULL,
    "group_id" INTEGER NOT NULL,
    "source" "GroupSource" NOT NULL DEFAULT 'APP',
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_by" TEXT,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "employee_group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_reports" (
    "id" SERIAL NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "username" VARCHAR(255),
    "userAgent" TEXT,
    "url" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "zone" "Zone" NOT NULL DEFAULT 'JPN',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255),
    "message" TEXT NOT NULL,
    "type" VARCHAR(50),
    "link" VARCHAR(255),
    "zone" "Zone" NOT NULL DEFAULT 'JPN',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_recipients" (
    "id" SERIAL NOT NULL,
    "notification_id" INTEGER NOT NULL,
    "recipient_type" VARCHAR(20) NOT NULL,
    "username" TEXT,
    "group_id" INTEGER,
    "zone" "Zone" NOT NULL DEFAULT 'JPN',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notification_status" (
    "id" SERIAL NOT NULL,
    "notification_id" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ,
    "zone" "Zone" NOT NULL DEFAULT 'JPN',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notification_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_cards" (
    "card_id" TEXT NOT NULL,
    "employee_username" TEXT,
    "guest_username" TEXT,
    "status" "CardStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "pin_hash" TEXT,
    "pin_salt" TEXT,
    "pin_created_at" TIMESTAMPTZ,
    "pin_last_verified" TIMESTAMPTZ,
    "pin_failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "pin_locked_until" TIMESTAMPTZ,
    "assigned_date" TIMESTAMPTZ,
    "assigned_by" TEXT,
    "revoked_date" TIMESTAMPTZ,
    "revoked_by" TEXT,
    "last_used" TIMESTAMPTZ,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "zone" "Zone" NOT NULL DEFAULT 'JPN',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_cards_pkey" PRIMARY KEY ("card_id")
);

-- CreateTable
CREATE TABLE "pin_history" (
    "id" SERIAL NOT NULL,
    "card_id" TEXT NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "pin_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "category" JSONB,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "action" "PermissionAction" NOT NULL DEFAULT 'READ',
    "resource" TEXT NOT NULL DEFAULT '*',
    "scope" "PermissionScope" NOT NULL DEFAULT 'ALL',
    "access_type" "AccessType" NOT NULL DEFAULT 'BOTH',
    "requires_mfa" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_permissions" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,
    "granted_by" TEXT NOT NULL,
    "zone" "Zone" NOT NULL DEFAULT 'JPN',
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "group_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_zones" (
    "id" SERIAL NOT NULL,
    "employee_username" TEXT NOT NULL,
    "zone" "Zone" NOT NULL,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" TEXT,

    CONSTRAINT "employee_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_username_key" ON "auth_users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_key" ON "auth_sessions"("token");

-- CreateIndex
CREATE INDEX "auth_sessions_token_idx" ON "auth_sessions"("token");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_order_receipts_code_key" ON "app_order_receipts"("code");

-- CreateIndex
CREATE INDEX "app_order_receipts_customer_id_idx" ON "app_order_receipts"("customer_id");

-- CreateIndex
CREATE INDEX "app_order_receipts_received_at_idx" ON "app_order_receipts"("received_at");

-- CreateIndex
CREATE INDEX "app_order_receipts_total_amount_idx" ON "app_order_receipts"("total_amount");

-- CreateIndex
CREATE UNIQUE INDEX "app_orders_code_key" ON "app_orders"("code");

-- CreateIndex
CREATE INDEX "app_orders_order_receipt_id_idx" ON "app_orders"("order_receipt_id");

-- CreateIndex
CREATE INDEX "app_orders_order_receipt_id_total_amount_idx" ON "app_orders"("order_receipt_id", "total_amount");

-- CreateIndex
CREATE INDEX "app_orders_end_user_id_idx" ON "app_orders"("end_user_id");

-- CreateIndex
CREATE INDEX "app_orders_status_idx" ON "app_orders"("status");

-- CreateIndex
CREATE INDEX "app_manufacturing_workflows_order_id_idx" ON "app_manufacturing_workflows"("order_id");

-- CreateIndex
CREATE INDEX "app_workflow_links_source_workflow_id_idx" ON "app_workflow_links"("source_workflow_id");

-- CreateIndex
CREATE INDEX "app_workflow_links_target_workflow_id_idx" ON "app_workflow_links"("target_workflow_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_workflow_links_source_workflow_id_target_workflow_id_key" ON "app_workflow_links"("source_workflow_id", "target_workflow_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_products_code_version_key" ON "app_products"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "app_materials_code_key" ON "app_materials"("code");

-- CreateIndex
CREATE UNIQUE INDEX "app_materials_mfr_code_mfr_grade_code_shape_code_type_code_key" ON "app_materials"("mfr_code", "mfr_grade_code", "shape_code", "type_code");

-- CreateIndex
CREATE INDEX "app_stock_purchases_supplier_id_idx" ON "app_stock_purchases"("supplier_id");

-- CreateIndex
CREATE INDEX "app_stock_purchases_purchase_date_idx" ON "app_stock_purchases"("purchase_date");

-- CreateIndex
CREATE INDEX "app_stock_purchases_status_idx" ON "app_stock_purchases"("status");

-- CreateIndex
CREATE INDEX "app_stock_purchases_employee_username_idx" ON "app_stock_purchases"("employee_username");

-- CreateIndex
CREATE UNIQUE INDEX "app_stock_purchase_items_stock_transaction_id_key" ON "app_stock_purchase_items"("stock_transaction_id");

-- CreateIndex
CREATE INDEX "app_stock_purchase_items_stock_purchase_id_idx" ON "app_stock_purchase_items"("stock_purchase_id");

-- CreateIndex
CREATE INDEX "app_stock_purchase_items_material_id_diameter_length_polish_idx" ON "app_stock_purchase_items"("material_id", "diameter", "length", "polished", "custom_type");

-- CreateIndex
CREATE INDEX "app_stock_purchase_items_factory_id_idx" ON "app_stock_purchase_items"("factory_id");

-- CreateIndex
CREATE INDEX "app_stock_purchase_items_stock_transaction_id_idx" ON "app_stock_purchase_items"("stock_transaction_id");

-- CreateIndex
CREATE INDEX "app_stock_purchase_approvers_stock_purchase_id_idx" ON "app_stock_purchase_approvers"("stock_purchase_id");

-- CreateIndex
CREATE INDEX "app_stock_purchase_approvers_group_id_idx" ON "app_stock_purchase_approvers"("group_id");

-- CreateIndex
CREATE INDEX "app_stock_purchase_approvers_employee_username_idx" ON "app_stock_purchase_approvers"("employee_username");

-- CreateIndex
CREATE UNIQUE INDEX "app_stock_purchase_approvers_stock_purchase_id_group_id_emp_key" ON "app_stock_purchase_approvers"("stock_purchase_id", "group_id", "employee_username");

-- CreateIndex
CREATE INDEX "app_stocks_material_id_diameter_length_polished_custom_type_idx" ON "app_stocks"("material_id", "diameter", "length", "polished", "custom_type", "factory_id");

-- CreateIndex
CREATE INDEX "app_stocks_factory_id_idx" ON "app_stocks"("factory_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_stocks_material_id_diameter_length_polished_custom_type_key" ON "app_stocks"("material_id", "diameter", "length", "polished", "custom_type", "factory_id");

-- CreateIndex
CREATE INDEX "app_stock_reservations_material_id_diameter_length_polished_idx" ON "app_stock_reservations"("material_id", "diameter", "length", "polished", "custom_type", "factory_id", "status");

-- CreateIndex
CREATE INDEX "app_stock_reservations_factory_id_idx" ON "app_stock_reservations"("factory_id");

-- CreateIndex
CREATE INDEX "app_stock_reservations_order_id_status_idx" ON "app_stock_reservations"("order_id", "status");

-- CreateIndex
CREATE INDEX "app_stock_reservations_stock_purchase_id_status_idx" ON "app_stock_reservations"("stock_purchase_id", "status");

-- CreateIndex
CREATE INDEX "app_stock_transactions_material_id_diameter_length_polished_idx" ON "app_stock_transactions"("material_id", "diameter", "length", "polished", "custom_type", "transaction_type");

-- CreateIndex
CREATE INDEX "app_stock_transactions_transaction_type_created_at_idx" ON "app_stock_transactions"("transaction_type", "created_at");

-- CreateIndex
CREATE INDEX "app_stock_transactions_reservation_id_idx" ON "app_stock_transactions"("reservation_id");

-- CreateIndex
CREATE INDEX "app_stock_transactions_factory_id_idx" ON "app_stock_transactions"("factory_id");

-- CreateIndex
CREATE INDEX "app_stock_transactions_linked_transaction_id_idx" ON "app_stock_transactions"("linked_transaction_id");

-- CreateIndex
CREATE INDEX "app_process_templates_display_order_idx" ON "app_process_templates"("display_order");

-- CreateIndex
CREATE INDEX "app_process_templates_step_kind_idx" ON "app_process_templates"("step_kind");

-- CreateIndex
CREATE INDEX "app_process_templates_is_special_idx" ON "app_process_templates"("is_special");

-- CreateIndex
CREATE INDEX "app_process_plans_template_id_idx" ON "app_process_plans"("template_id");

-- CreateIndex
CREATE INDEX "app_process_plans_workflow_id_idx" ON "app_process_plans"("workflow_id");

-- CreateIndex
CREATE INDEX "app_process_plans_status_idx" ON "app_process_plans"("status");

-- CreateIndex
CREATE INDEX "app_process_plans_factory_id_idx" ON "app_process_plans"("factory_id");

-- CreateIndex
CREATE INDEX "app_process_records_plan_id_idx" ON "app_process_records"("plan_id");

-- CreateIndex
CREATE INDEX "app_process_records_type_idx" ON "app_process_records"("type");

-- CreateIndex
CREATE UNIQUE INDEX "app_factories_code_key" ON "app_factories"("code");

-- CreateIndex
CREATE INDEX "app_factories_code_idx" ON "app_factories"("code");

-- CreateIndex
CREATE INDEX "app_factories_name_idx" ON "app_factories"("name");

-- CreateIndex
CREATE INDEX "app_factories_is_active_idx" ON "app_factories"("is_active");

-- CreateIndex
CREATE INDEX "app_machines_factory_id_idx" ON "app_machines"("factory_id");

-- CreateIndex
CREATE INDEX "app_machine_programs_product_id_idx" ON "app_machine_programs"("product_id");

-- CreateIndex
CREATE INDEX "app_machine_program_step_templates_machine_program_id_idx" ON "app_machine_program_step_templates"("machine_program_id");

-- CreateIndex
CREATE INDEX "app_inspection_programs_product_id_idx" ON "app_inspection_programs"("product_id");

-- CreateIndex
CREATE INDEX "app_inspection_program_step_templates_inspection_program_id_idx" ON "app_inspection_program_step_templates"("inspection_program_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_companies_code_key" ON "app_companies"("code");

-- CreateIndex
CREATE INDEX "app_companies_code_idx" ON "app_companies"("code");

-- CreateIndex
CREATE INDEX "app_companies_name_idx" ON "app_companies"("name");

-- CreateIndex
CREATE INDEX "app_companies_is_active_idx" ON "app_companies"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "app_customers_code_key" ON "app_customers"("code");

-- CreateIndex
CREATE INDEX "app_customers_code_idx" ON "app_customers"("code");

-- CreateIndex
CREATE INDEX "app_customers_company_id_idx" ON "app_customers"("company_id");

-- CreateIndex
CREATE INDEX "app_customers_name_idx" ON "app_customers"("name");

-- CreateIndex
CREATE INDEX "app_customers_is_active_idx" ON "app_customers"("is_active");

-- CreateIndex
CREATE INDEX "app_addresses_customer_id_idx" ON "app_addresses"("customer_id");

-- CreateIndex
CREATE INDEX "app_shipping_instructions_order_id_idx" ON "app_shipping_instructions"("order_id");

-- CreateIndex
CREATE INDEX "app_shipping_instructions_from_factory_id_idx" ON "app_shipping_instructions"("from_factory_id");

-- CreateIndex
CREATE INDEX "app_shipping_instructions_to_factory_id_idx" ON "app_shipping_instructions"("to_factory_id");

-- CreateIndex
CREATE INDEX "app_shipping_instructions_to_address_id_idx" ON "app_shipping_instructions"("to_address_id");

-- CreateIndex
CREATE INDEX "app_shipping_instructions_invoice_to_address_id_idx" ON "app_shipping_instructions"("invoice_to_address_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_suppliers_code_key" ON "app_suppliers"("code");

-- CreateIndex
CREATE INDEX "app_suppliers_code_idx" ON "app_suppliers"("code");

-- CreateIndex
CREATE INDEX "app_suppliers_name_idx" ON "app_suppliers"("name");

-- CreateIndex
CREATE INDEX "app_suppliers_is_active_idx" ON "app_suppliers"("is_active");

-- CreateIndex
CREATE INDEX "logs_employee_username_idx" ON "logs"("employee_username");

-- CreateIndex
CREATE INDEX "logs_timestamp_idx" ON "logs"("timestamp");

-- CreateIndex
CREATE INDEX "employees_is_enabled_idx" ON "employees"("is_enabled");

-- CreateIndex
CREATE INDEX "idx_employees_username_is_enabled" ON "employees"("username", "is_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "settings_employees_employee_username_key" ON "settings_employees"("employee_username");

-- CreateIndex
CREATE UNIQUE INDEX "settings_guests_guest_username_key" ON "settings_guests"("guest_username");

-- CreateIndex
CREATE UNIQUE INDEX "groups_name_key" ON "groups"("name");

-- CreateIndex
CREATE INDEX "employee_group_memberships_group_id_idx" ON "employee_group_memberships"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_group_memberships_employee_username_group_id_key" ON "employee_group_memberships"("employee_username", "group_id");

-- CreateIndex
CREATE INDEX "bug_reports_username_idx" ON "bug_reports"("username");

-- CreateIndex
CREATE INDEX "bug_reports_status_idx" ON "bug_reports"("status");

-- CreateIndex
CREATE INDEX "bug_reports_created_at_idx" ON "bug_reports"("created_at");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "notification_recipients_recipient_type_username_idx" ON "notification_recipients"("recipient_type", "username");

-- CreateIndex
CREATE INDEX "notification_recipients_recipient_type_group_id_idx" ON "notification_recipients"("recipient_type", "group_id");

-- CreateIndex
CREATE INDEX "notification_recipients_notification_id_idx" ON "notification_recipients"("notification_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_recipients_notification_id_recipient_type_user_key" ON "notification_recipients"("notification_id", "recipient_type", "username", "group_id");

-- CreateIndex
CREATE INDEX "user_notification_status_username_is_read_idx" ON "user_notification_status"("username", "is_read");

-- CreateIndex
CREATE INDEX "user_notification_status_notification_id_idx" ON "user_notification_status"("notification_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_notification_status_notification_id_username_key" ON "user_notification_status"("notification_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "group_permissions_group_id_permission_id_key" ON "group_permissions"("group_id", "permission_id");

-- CreateIndex
CREATE INDEX "employee_zones_employee_username_idx" ON "employee_zones"("employee_username");

-- CreateIndex
CREATE INDEX "employee_zones_zone_idx" ON "employee_zones"("zone");

-- CreateIndex
CREATE UNIQUE INDEX "employee_zones_employee_username_zone_key" ON "employee_zones"("employee_username", "zone");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_order_receipts" ADD CONSTRAINT "app_order_receipts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "app_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_order_receipts" ADD CONSTRAINT "app_order_receipts_employee_username_fkey" FOREIGN KEY ("employee_username") REFERENCES "employees"("username") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_orders" ADD CONSTRAINT "app_orders_order_receipt_id_fkey" FOREIGN KEY ("order_receipt_id") REFERENCES "app_order_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_orders" ADD CONSTRAINT "app_orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_orders" ADD CONSTRAINT "app_orders_end_user_id_fkey" FOREIGN KEY ("end_user_id") REFERENCES "app_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_manufacturing_workflows" ADD CONSTRAINT "app_manufacturing_workflows_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "app_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_workflow_links" ADD CONSTRAINT "app_workflow_links_source_workflow_id_fkey" FOREIGN KEY ("source_workflow_id") REFERENCES "app_manufacturing_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_workflow_links" ADD CONSTRAINT "app_workflow_links_target_workflow_id_fkey" FOREIGN KEY ("target_workflow_id") REFERENCES "app_manufacturing_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_workflow_links" ADD CONSTRAINT "app_workflow_links_split_after_plan_id_fkey" FOREIGN KEY ("split_after_plan_id") REFERENCES "app_process_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_products" ADD CONSTRAINT "app_products_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "app_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_products" ADD CONSTRAINT "app_products_inherited_from_fkey" FOREIGN KEY ("inherited_from") REFERENCES "app_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stock_purchases" ADD CONSTRAINT "app_stock_purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "app_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stock_purchases" ADD CONSTRAINT "app_stock_purchases_employee_username_fkey" FOREIGN KEY ("employee_username") REFERENCES "employees"("username") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stock_purchase_items" ADD CONSTRAINT "app_stock_purchase_items_stock_purchase_id_fkey" FOREIGN KEY ("stock_purchase_id") REFERENCES "app_stock_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stock_purchase_items" ADD CONSTRAINT "app_stock_purchase_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "app_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stock_purchase_items" ADD CONSTRAINT "app_stock_purchase_items_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "app_factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stock_purchase_items" ADD CONSTRAINT "app_stock_purchase_items_stock_transaction_id_fkey" FOREIGN KEY ("stock_transaction_id") REFERENCES "app_stock_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stock_purchase_approvers" ADD CONSTRAINT "app_stock_purchase_approvers_stock_purchase_id_fkey" FOREIGN KEY ("stock_purchase_id") REFERENCES "app_stock_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stock_purchase_approvers" ADD CONSTRAINT "app_stock_purchase_approvers_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stock_purchase_approvers" ADD CONSTRAINT "app_stock_purchase_approvers_employee_username_fkey" FOREIGN KEY ("employee_username") REFERENCES "employees"("username") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stocks" ADD CONSTRAINT "app_stocks_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "app_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stocks" ADD CONSTRAINT "app_stocks_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "app_factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stock_reservations" ADD CONSTRAINT "app_stock_reservations_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "app_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stock_reservations" ADD CONSTRAINT "app_stock_reservations_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "app_factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stock_reservations" ADD CONSTRAINT "app_stock_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "app_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stock_reservations" ADD CONSTRAINT "app_stock_reservations_stock_purchase_id_fkey" FOREIGN KEY ("stock_purchase_id") REFERENCES "app_stock_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stock_transactions" ADD CONSTRAINT "app_stock_transactions_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "app_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stock_transactions" ADD CONSTRAINT "app_stock_transactions_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "app_factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stock_transactions" ADD CONSTRAINT "app_stock_transactions_linked_transaction_id_fkey" FOREIGN KEY ("linked_transaction_id") REFERENCES "app_stock_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stock_transactions" ADD CONSTRAINT "app_stock_transactions_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "app_stock_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stock_transactions" ADD CONSTRAINT "app_stock_transactions_employee_username_fkey" FOREIGN KEY ("employee_username") REFERENCES "employees"("username") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_process_plans" ADD CONSTRAINT "app_process_plans_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "app_manufacturing_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_process_plans" ADD CONSTRAINT "app_process_plans_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "app_process_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_process_plans" ADD CONSTRAINT "app_process_plans_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "app_factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_process_plans" ADD CONSTRAINT "app_process_plans_from_factory_id_fkey" FOREIGN KEY ("from_factory_id") REFERENCES "app_factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_process_plans" ADD CONSTRAINT "app_process_plans_to_factory_id_fkey" FOREIGN KEY ("to_factory_id") REFERENCES "app_factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_process_plans" ADD CONSTRAINT "app_process_plans_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "employees"("username") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_process_records" ADD CONSTRAINT "app_process_records_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "app_process_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_process_records" ADD CONSTRAINT "app_process_records_achieved_by_fkey" FOREIGN KEY ("achieved_by") REFERENCES "employees"("username") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_machines" ADD CONSTRAINT "app_machines_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "app_factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_machine_programs" ADD CONSTRAINT "app_machine_programs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_machine_program_step_templates" ADD CONSTRAINT "app_machine_program_step_templates_machine_program_id_fkey" FOREIGN KEY ("machine_program_id") REFERENCES "app_machine_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_machine_program_machines" ADD CONSTRAINT "app_machine_program_machines_machine_program_id_fkey" FOREIGN KEY ("machine_program_id") REFERENCES "app_machine_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_machine_program_machines" ADD CONSTRAINT "app_machine_program_machines_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "app_machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_inspection_programs" ADD CONSTRAINT "app_inspection_programs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_inspection_program_step_templates" ADD CONSTRAINT "app_inspection_program_step_templates_inspection_program_i_fkey" FOREIGN KEY ("inspection_program_id") REFERENCES "app_inspection_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_inspection_program_machines" ADD CONSTRAINT "app_inspection_program_machines_inspection_program_id_fkey" FOREIGN KEY ("inspection_program_id") REFERENCES "app_inspection_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_inspection_program_machines" ADD CONSTRAINT "app_inspection_program_machines_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "app_machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_customers" ADD CONSTRAINT "app_customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "app_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_addresses" ADD CONSTRAINT "app_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "app_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_shipping_instructions" ADD CONSTRAINT "app_shipping_instructions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "app_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_shipping_instructions" ADD CONSTRAINT "app_shipping_instructions_from_factory_id_fkey" FOREIGN KEY ("from_factory_id") REFERENCES "app_factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_shipping_instructions" ADD CONSTRAINT "app_shipping_instructions_to_factory_id_fkey" FOREIGN KEY ("to_factory_id") REFERENCES "app_factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_shipping_instructions" ADD CONSTRAINT "app_shipping_instructions_to_address_id_fkey" FOREIGN KEY ("to_address_id") REFERENCES "app_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_shipping_instructions" ADD CONSTRAINT "app_shipping_instructions_invoice_to_address_id_fkey" FOREIGN KEY ("invoice_to_address_id") REFERENCES "app_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs" ADD CONSTRAINT "logs_employee_username_fkey" FOREIGN KEY ("employee_username") REFERENCES "employees"("username") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_employees" ADD CONSTRAINT "settings_employees_employee_username_fkey" FOREIGN KEY ("employee_username") REFERENCES "employees"("username") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_guests" ADD CONSTRAINT "settings_guests_guest_username_fkey" FOREIGN KEY ("guest_username") REFERENCES "guests"("username") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_group_memberships" ADD CONSTRAINT "employee_group_memberships_employee_username_fkey" FOREIGN KEY ("employee_username") REFERENCES "employees"("username") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_group_memberships" ADD CONSTRAINT "employee_group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_status" ADD CONSTRAINT "user_notification_status_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_cards" ADD CONSTRAINT "access_cards_employee_username_fkey" FOREIGN KEY ("employee_username") REFERENCES "employees"("username") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_cards" ADD CONSTRAINT "access_cards_guest_username_fkey" FOREIGN KEY ("guest_username") REFERENCES "guests"("username") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pin_history" ADD CONSTRAINT "pin_history_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "access_cards"("card_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_permissions" ADD CONSTRAINT "group_permissions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_permissions" ADD CONSTRAINT "group_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_zones" ADD CONSTRAINT "employee_zones_employee_username_fkey" FOREIGN KEY ("employee_username") REFERENCES "employees"("username") ON DELETE CASCADE ON UPDATE CASCADE;
