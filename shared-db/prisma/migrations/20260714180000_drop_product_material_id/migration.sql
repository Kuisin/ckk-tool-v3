-- DropForeignKey
ALTER TABLE "app"."products" DROP CONSTRAINT "products_material_id_fkey";
-- AlterTable
ALTER TABLE "app"."products" DROP COLUMN "material_id";
