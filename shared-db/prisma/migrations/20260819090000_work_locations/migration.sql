-- AlterTable
ALTER TABLE "app"."work_order_step_plans" ADD COLUMN     "work_location_id" INTEGER;

-- CreateTable
CREATE TABLE "app"."work_location_groups" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "type_key" TEXT NOT NULL,
    "factory_id" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "work_location_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."work_locations" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "capacity" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "work_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_location_groups_code_key" ON "app"."work_location_groups"("code");

-- CreateIndex
CREATE INDEX "work_location_groups_type_key_idx" ON "app"."work_location_groups"("type_key");

-- CreateIndex
CREATE UNIQUE INDEX "work_locations_code_key" ON "app"."work_locations"("code");

-- CreateIndex
CREATE INDEX "work_locations_group_id_sort_order_idx" ON "app"."work_locations"("group_id", "sort_order");

-- AddForeignKey
ALTER TABLE "app"."work_location_groups" ADD CONSTRAINT "work_location_groups_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "app"."factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."work_locations" ADD CONSTRAINT "work_locations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "app"."work_location_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."work_order_step_plans" ADD CONSTRAINT "work_order_step_plans_work_location_id_fkey" FOREIGN KEY ("work_location_id") REFERENCES "app"."work_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

