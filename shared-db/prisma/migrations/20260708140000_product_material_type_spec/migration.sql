-- AlterTable
ALTER TABLE "app"."products" ADD COLUMN     "diameter_mm" DECIMAL(8,3),
ADD COLUMN     "length_mm" DECIMAL(10,3),
ADD COLUMN     "material_type_id" INTEGER;
-- CreateIndex
CREATE INDEX "products_material_type_id_idx" ON "app"."products"("material_type_id");
-- AddForeignKey
ALTER TABLE "app"."products" ADD CONSTRAINT "products_material_type_id_fkey" FOREIGN KEY ("material_type_id") REFERENCES "app"."material_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
