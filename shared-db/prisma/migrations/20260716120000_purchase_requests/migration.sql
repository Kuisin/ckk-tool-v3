-- CreateEnum
CREATE TYPE "app"."PURCHASE_REQUEST_STATUS" AS ENUM ('DRAFT', 'REQUESTED', 'APPROVED', 'REJECTED', 'ORDERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "app"."purchase_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_number" TEXT NOT NULL,
    "status" "app"."PURCHASE_REQUEST_STATUS" NOT NULL DEFAULT 'DRAFT',
    "purpose" TEXT,
    "requested_at" TIMESTAMPTZ(6),
    "requested_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "ordered_at" TIMESTAMPTZ(6),
    "ordered_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by" UUID,
    "cancel_reason" TEXT,
    "history" JSONB,
    "purchase_order_id" UUID,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."purchase_request_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "material_id" INTEGER NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "desired_at" DATE,
    "factory_id" INTEGER,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_request_number_key" ON "app"."purchase_requests"("request_number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_purchase_order_id_key" ON "app"."purchase_requests"("purchase_order_id");

-- CreateIndex
CREATE INDEX "purchase_requests_status_idx" ON "app"."purchase_requests"("status");

-- CreateIndex
CREATE INDEX "purchase_request_items_request_id_idx" ON "app"."purchase_request_items"("request_id");

-- AddForeignKey
ALTER TABLE "app"."purchase_requests" ADD CONSTRAINT "purchase_requests_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "app"."material_purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."purchase_requests" ADD CONSTRAINT "purchase_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."purchase_requests" ADD CONSTRAINT "purchase_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."purchase_requests" ADD CONSTRAINT "purchase_requests_ordered_by_fkey" FOREIGN KEY ("ordered_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."purchase_requests" ADD CONSTRAINT "purchase_requests_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."purchase_requests" ADD CONSTRAINT "purchase_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."purchase_request_items" ADD CONSTRAINT "purchase_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "app"."purchase_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."purchase_request_items" ADD CONSTRAINT "purchase_request_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "app"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."purchase_request_items" ADD CONSTRAINT "purchase_request_items_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "app"."factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

