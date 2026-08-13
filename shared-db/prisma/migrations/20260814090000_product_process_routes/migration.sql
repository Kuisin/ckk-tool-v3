-- 工程数量管理モード（NONE/FLOW/INSPECTION）+ 製品工程ルート（バージョン管理）

-- CreateEnum
CREATE TYPE "app"."QUANTITY_TRACKING" AS ENUM ('NONE', 'FLOW', 'INSPECTION');

-- AlterTable
ALTER TABLE "app"."process_step_catalog" ADD COLUMN     "quantity_tracking" "app"."QUANTITY_TRACKING" NOT NULL DEFAULT 'FLOW';
-- バックフィル: 検査工程は INSPECTION（承認工程などは運用で NONE へ切替可）
UPDATE "app"."process_step_catalog" SET "quantity_tracking" = 'INSPECTION' WHERE "is_inspection" = true;

-- AlterTable
ALTER TABLE "app"."work_orders" ADD COLUMN     "route_version_id" UUID;

-- CreateTable
CREATE TABLE "app"."product_process_routes" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "name" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_process_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."product_process_route_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_process_route_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."product_process_route_version_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route_version_id" UUID NOT NULL,
    "process_step_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "execution_location" "app"."STEP_EXECUTION" NOT NULL,
    "factory_id" INTEGER,
    "supplier_bp_id" UUID,

    CONSTRAINT "product_process_route_version_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_process_routes_product_id_idx" ON "app"."product_process_routes"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_process_route_versions_route_id_version_key" ON "app"."product_process_route_versions"("route_id", "version");

-- CreateIndex
CREATE INDEX "product_process_route_version_steps_route_version_id_sort_o_idx" ON "app"."product_process_route_version_steps"("route_version_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "product_process_route_version_steps_route_version_id_proces_key" ON "app"."product_process_route_version_steps"("route_version_id", "process_step_id");

-- CreateIndex
CREATE INDEX "work_orders_route_version_id_idx" ON "app"."work_orders"("route_version_id");

-- AddForeignKey
ALTER TABLE "app"."product_process_routes" ADD CONSTRAINT "product_process_routes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."product_process_routes" ADD CONSTRAINT "product_process_routes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."product_process_route_versions" ADD CONSTRAINT "product_process_route_versions_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "app"."product_process_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."product_process_route_versions" ADD CONSTRAINT "product_process_route_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."product_process_route_version_steps" ADD CONSTRAINT "product_process_route_version_steps_route_version_id_fkey" FOREIGN KEY ("route_version_id") REFERENCES "app"."product_process_route_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."product_process_route_version_steps" ADD CONSTRAINT "product_process_route_version_steps_process_step_id_fkey" FOREIGN KEY ("process_step_id") REFERENCES "app"."process_step_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."product_process_route_version_steps" ADD CONSTRAINT "product_process_route_version_steps_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "app"."factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."product_process_route_version_steps" ADD CONSTRAINT "product_process_route_version_steps_supplier_bp_id_fkey" FOREIGN KEY ("supplier_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."work_orders" ADD CONSTRAINT "work_orders_route_version_id_fkey" FOREIGN KEY ("route_version_id") REFERENCES "app"."product_process_route_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

