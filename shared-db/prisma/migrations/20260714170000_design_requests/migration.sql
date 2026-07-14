-- CreateEnum
CREATE TYPE "app"."DESIGN_TRIGGER" AS ENUM ('QUOTE', 'SALES_ORDER');
-- CreateEnum
CREATE TYPE "app"."DESIGN_STATUS" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');
-- CreateTable
CREATE TABLE "app"."design_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_number" TEXT NOT NULL,
    "trigger" "app"."DESIGN_TRIGGER" NOT NULL,
    "quote_year_month" CHAR(6),
    "quote_seq" INTEGER,
    "sales_order_id" UUID,
    "product_id" INTEGER,
    "description" TEXT,
    "status" "app"."DESIGN_STATUS" NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "design_requests_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."design_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "design_request_id" UUID,
    "product_id" INTEGER,
    "file_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_latest" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "design_files_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "design_requests_request_number_key" ON "app"."design_requests"("request_number");
-- CreateIndex
CREATE INDEX "design_requests_status_idx" ON "app"."design_requests"("status");
-- CreateIndex
CREATE INDEX "design_files_design_request_id_idx" ON "app"."design_files"("design_request_id");
-- AddForeignKey
ALTER TABLE "app"."design_requests" ADD CONSTRAINT "design_requests_quote_year_month_quote_seq_fkey" FOREIGN KEY ("quote_year_month", "quote_seq") REFERENCES "app"."quotes"("year_month", "seq") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."design_requests" ADD CONSTRAINT "design_requests_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "app"."sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."design_requests" ADD CONSTRAINT "design_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."design_requests" ADD CONSTRAINT "design_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."design_files" ADD CONSTRAINT "design_files_design_request_id_fkey" FOREIGN KEY ("design_request_id") REFERENCES "app"."design_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."design_files" ADD CONSTRAINT "design_files_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."design_files" ADD CONSTRAINT "design_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "app"."files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."design_files" ADD CONSTRAINT "design_files_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
