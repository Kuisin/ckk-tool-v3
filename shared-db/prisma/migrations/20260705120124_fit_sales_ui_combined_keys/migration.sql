-- CreateEnum
CREATE TYPE "sales"."TRIAL_TOOL_TYPE" AS ENUM ('ROUND_BAR', 'CYLINDER', 'OH');

-- CreateEnum
CREATE TYPE "sales"."PRICE_DISCOUNT_TYPE" AS ENUM ('RATE', 'AMOUNT');

-- DropForeignKey
ALTER TABLE "sales"."estimates" DROP CONSTRAINT "estimates_customer_bp_id_fkey";

-- DropForeignKey
ALTER TABLE "sales"."estimates" DROP CONSTRAINT "estimates_product_id_fkey";

-- DropForeignKey
ALTER TABLE "sales"."estimate_tiers" DROP CONSTRAINT "estimate_tiers_estimate_id_fkey";

-- DropForeignKey
ALTER TABLE "sales"."estimate_tiers" DROP CONSTRAINT "estimate_tiers_price_list_entry_id_fkey";

-- DropForeignKey
ALTER TABLE "sales"."price_list_entries" DROP CONSTRAINT "price_list_entries_estimate_id_fkey";

-- DropForeignKey
ALTER TABLE "sales"."price_list_tiers" DROP CONSTRAINT "price_list_tiers_price_list_entry_id_fkey";

-- DropForeignKey
ALTER TABLE "sales"."quote_items" DROP CONSTRAINT "quote_items_quote_id_fkey";

-- DropIndex
DROP INDEX "sales"."estimates_estimate_number_key";

-- DropIndex
DROP INDEX "sales"."price_list_entries_customer_bp_id_product_id_order_type_key";

-- DropIndex
DROP INDEX "sales"."price_list_tiers_price_list_entry_id_min_quantity_idx";

-- DropIndex
DROP INDEX "sales"."quotes_quote_number_key";

-- AlterTable
ALTER TABLE "sales"."estimates" DROP CONSTRAINT "estimates_pkey",
DROP COLUMN "currency",
DROP COLUMN "estimate_number",
DROP COLUMN "id",
DROP COLUMN "machining_minutes",
DROP COLUMN "machining_rate",
DROP COLUMN "margin_rate",
DROP COLUMN "material_unit_cost",
DROP COLUMN "order_type",
DROP COLUMN "outsource_cost",
DROP COLUMN "product_id",
DROP COLUMN "setup_cost",
ADD COLUMN     "input" JSONB NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "reference_date" DATE,
ADD COLUMN     "reference_overridden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reference_unit_price" DECIMAL(12,2),
ADD COLUMN     "result" JSONB,
ADD COLUMN     "seq" INTEGER NOT NULL,
ADD COLUMN     "tool_type" "sales"."TRIAL_TOOL_TYPE" NOT NULL,
ADD COLUMN     "year_month" CHAR(6) NOT NULL,
ALTER COLUMN "customer_bp_id" DROP NOT NULL,
ADD CONSTRAINT "estimates_pkey" PRIMARY KEY ("year_month", "seq");

-- AlterTable
ALTER TABLE "sales"."price_list_entries" DROP CONSTRAINT "price_list_entries_pkey",
DROP COLUMN "estimate_id",
DROP COLUMN "id",
ADD COLUMN     "base_unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "estimate_seq" INTEGER,
ADD COLUMN     "estimate_year_month" CHAR(6),
ADD CONSTRAINT "price_list_entries_pkey" PRIMARY KEY ("customer_bp_id", "product_id", "order_type");

-- AlterTable
ALTER TABLE "sales"."price_list_tiers" DROP COLUMN "price_list_entry_id",
DROP COLUMN "unit_price",
ADD COLUMN     "customer_bp_id" UUID NOT NULL,
ADD COLUMN     "multiplier" DECIMAL(8,3) NOT NULL DEFAULT 1,
ADD COLUMN     "order_type" "sales"."ORDER_TYPE" NOT NULL,
ADD COLUMN     "price_override" DECIMAL(12,2),
ADD COLUMN     "product_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "sales"."quotes" DROP CONSTRAINT "quotes_pkey",
DROP COLUMN "id",
DROP COLUMN "quote_number",
ADD COLUMN     "seq" INTEGER NOT NULL,
ADD COLUMN     "year_month" CHAR(6) NOT NULL,
ADD CONSTRAINT "quotes_pkey" PRIMARY KEY ("year_month", "seq");

-- AlterTable
ALTER TABLE "sales"."quote_items" DROP COLUMN "quote_id",
ADD COLUMN     "discount_label" TEXT,
ADD COLUMN     "quote_seq" INTEGER NOT NULL,
ADD COLUMN     "quote_year_month" CHAR(6) NOT NULL;

-- DropTable
DROP TABLE "sales"."estimate_tiers";

-- CreateTable
CREATE TABLE "sales"."price_list_discounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_bp_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "order_type" "sales"."ORDER_TYPE" NOT NULL,
    "label" TEXT NOT NULL,
    "discount_type" "sales"."PRICE_DISCOUNT_TYPE" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "min_quantity" INTEGER NOT NULL DEFAULT 1,
    "max_quantity" INTEGER,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_list_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_list_discounts_customer_bp_id_product_id_order_type_idx" ON "sales"."price_list_discounts"("customer_bp_id", "product_id", "order_type");

-- CreateIndex
CREATE INDEX "price_list_tiers_customer_bp_id_product_id_order_type_min_q_idx" ON "sales"."price_list_tiers"("customer_bp_id", "product_id", "order_type", "min_quantity");

-- AddForeignKey
ALTER TABLE "sales"."estimates" ADD CONSTRAINT "estimates_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."price_list_entries" ADD CONSTRAINT "price_list_entries_estimate_year_month_estimate_seq_fkey" FOREIGN KEY ("estimate_year_month", "estimate_seq") REFERENCES "sales"."estimates"("year_month", "seq") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."price_list_tiers" ADD CONSTRAINT "price_list_tiers_customer_bp_id_product_id_order_type_fkey" FOREIGN KEY ("customer_bp_id", "product_id", "order_type") REFERENCES "sales"."price_list_entries"("customer_bp_id", "product_id", "order_type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."price_list_discounts" ADD CONSTRAINT "price_list_discounts_customer_bp_id_product_id_order_type_fkey" FOREIGN KEY ("customer_bp_id", "product_id", "order_type") REFERENCES "sales"."price_list_entries"("customer_bp_id", "product_id", "order_type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."quote_items" ADD CONSTRAINT "quote_items_quote_year_month_quote_seq_fkey" FOREIGN KEY ("quote_year_month", "quote_seq") REFERENCES "sales"."quotes"("year_month", "seq") ON DELETE RESTRICT ON UPDATE CASCADE;

