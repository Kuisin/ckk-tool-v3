-- AlterTable
ALTER TABLE "app"."order_acceptances" ADD COLUMN     "quote_seq" INTEGER,
ADD COLUMN     "quote_year_month" CHAR(6);

-- AlterTable
ALTER TABLE "app"."work_order_steps" ADD COLUMN     "outsource_cost" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "app"."material_purchase_order_items" ADD COLUMN     "received_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0;

