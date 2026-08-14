-- 保管場所マスタ + 在庫の保管場所×棚バケット化。
-- - storage_locations: 工場内の倉庫・置場（MS0B 工場詳細で管理）
-- - storage_shelves:   保管場所内の棚（ロケーションビューの 1 マス）
-- - product_inventory / material_inventory に storage_location_id / shelf_id を追加し、
--   一意インデックスを 保管場所×棚 込みへ置換（PG17 NULLS NOT DISTINCT —
--   20260716_integrity_guards と同方式。null = 未割当バケットも一意）。

-- CreateTable
CREATE TABLE "app"."storage_locations" (
    "id" SERIAL NOT NULL,
    "factory_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "storage_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."storage_shelves" (
    "id" SERIAL NOT NULL,
    "location_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "storage_shelves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "storage_locations_code_key" ON "app"."storage_locations"("code");
CREATE INDEX "storage_locations_factory_id_idx" ON "app"."storage_locations"("factory_id");
CREATE UNIQUE INDEX "storage_shelves_location_id_code_key" ON "app"."storage_shelves"("location_id", "code");

-- AddForeignKey
ALTER TABLE "app"."storage_locations" ADD CONSTRAINT "storage_locations_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "app"."factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."storage_shelves" ADD CONSTRAINT "storage_shelves_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "app"."storage_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: 在庫の保管場所×棚
ALTER TABLE "app"."product_inventory"
  ADD COLUMN "storage_location_id" INTEGER,
  ADD COLUMN "shelf_id" INTEGER;
ALTER TABLE "app"."material_inventory"
  ADD COLUMN "storage_location_id" INTEGER,
  ADD COLUMN "shelf_id" INTEGER;

ALTER TABLE "app"."product_inventory" ADD CONSTRAINT "product_inventory_storage_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "app"."storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."product_inventory" ADD CONSTRAINT "product_inventory_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "app"."storage_shelves"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."material_inventory" ADD CONSTRAINT "material_inventory_storage_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "app"."storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."material_inventory" ADD CONSTRAINT "material_inventory_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "app"."storage_shelves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 一意バケットを保管場所×棚込みへ置換（NULLS NOT DISTINCT — 同時 ensure* の行分裂防止）
DROP INDEX "app"."product_inventory_product_id_factory_id_lot_number_is_semi__key";
CREATE UNIQUE INDEX "product_inventory_bucket_key"
  ON "app"."product_inventory" ("product_id", "factory_id", "lot_number", "is_semi_finished", "storage_location_id", "shelf_id")
  NULLS NOT DISTINCT;
DROP INDEX "app"."material_inventory_material_id_factory_id_key";
CREATE UNIQUE INDEX "material_inventory_bucket_key"
  ON "app"."material_inventory" ("material_id", "factory_id", "storage_location_id", "shelf_id")
  NULLS NOT DISTINCT;
