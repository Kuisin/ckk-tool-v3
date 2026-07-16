-- integrity_guards — 監査 P0-4/P0-7/P1-2/P1-8 の DB 側ガード（追加のみ・冪等配慮）

-- 1) 在庫の非負保証（キャッシュ列。台帳との整合は applyTransaction が担保）
ALTER TABLE "app"."product_inventory"
  ADD CONSTRAINT "product_inventory_nonneg_check"
  CHECK ("quantity" >= 0 AND "reserved_quantity" >= 0);
ALTER TABLE "app"."material_inventory"
  ADD CONSTRAINT "material_inventory_nonneg_check"
  CHECK ("quantity" >= 0 AND "reserved_quantity" >= 0);

-- 2) NULL キーでも一意（PG17 NULLS NOT DISTINCT）— 同時 ensure* の行分裂防止
DROP INDEX "app"."product_inventory_product_id_factory_id_lot_number_is_semi__key";
CREATE UNIQUE INDEX "product_inventory_product_id_factory_id_lot_number_is_semi__key"
  ON "app"."product_inventory" ("product_id", "factory_id", "lot_number", "is_semi_finished")
  NULLS NOT DISTINCT;
DROP INDEX "app"."material_inventory_material_id_factory_id_key";
CREATE UNIQUE INDEX "material_inventory_material_id_factory_id_key"
  ON "app"."material_inventory" ("material_id", "factory_id")
  NULLS NOT DISTINCT;

-- 3) 承認依頼の PENDING 重複防止（find-then-create 競合の後ろ盾）
CREATE UNIQUE INDEX "approval_requests_pending_unique"
  ON "app"."approval_requests" ("target_type", "target_id", "step")
  WHERE "status" = 'PENDING';
