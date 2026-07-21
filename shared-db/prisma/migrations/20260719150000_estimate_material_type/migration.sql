-- 試算(Estimate)の材料指定を「特定素材(material_id)」から
-- 「材種 × 直径 × 黒皮/研磨」へ移行する。参照価格は material_type_prices（¥/1000mm）
-- ＋仕入実績から解決する。

-- 1. 新カラム追加
ALTER TABLE "app"."estimates"
  ADD COLUMN "material_type_id"    INTEGER,
  ADD COLUMN "diameter_code"       CHAR(3),
  ADD COLUMN "surface_finish_code" CHAR(1);

-- 2. 既存データを紐付く素材から backfill（材種・直径・黒皮研磨）
UPDATE "app"."estimates" e
SET "material_type_id"    = m."material_type_id",
    "diameter_code"       = m."diameter_code",
    "surface_finish_code" = m."surface_finish_code"
FROM "app"."materials" m
WHERE e."material_id" = m."id";

-- 3. 旧カラム・FK 削除
ALTER TABLE "app"."estimates" DROP CONSTRAINT IF EXISTS "estimates_material_id_fkey";
ALTER TABLE "app"."estimates" DROP COLUMN "material_id";

-- 4. 新 FK
ALTER TABLE "app"."estimates" ADD CONSTRAINT "estimates_material_type_id_fkey" FOREIGN KEY ("material_type_id") REFERENCES "app"."material_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."estimates" ADD CONSTRAINT "estimates_diameter_code_fkey" FOREIGN KEY ("diameter_code") REFERENCES "app"."material_diameters"("code") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."estimates" ADD CONSTRAINT "estimates_surface_finish_code_fkey" FOREIGN KEY ("surface_finish_code") REFERENCES "app"."material_surface_finishes"("code") ON DELETE SET NULL ON UPDATE CASCADE;
