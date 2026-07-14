-- 材種/素材 採番マスタ (_specs/tables.md §Master Data, 採番表 ver1.2).
-- 既存 material_types のレガシー行 (3,555件, uuid id) は構成コード NULL の
-- 未変換プレースホルダとして共存する。materials は 0 件のため NOT NULL 追加可。

-- AlterTable
ALTER TABLE "app"."material_types" ADD COLUMN     "grade_code" CHAR(2),
ADD COLUMN     "kind_code" CHAR(4),
ADD COLUMN     "manufacturer_code" CHAR(1),
ADD COLUMN     "shape_code" CHAR(1);


-- AlterTable
ALTER TABLE "app"."materials" DROP COLUMN "material_form",
ADD COLUMN     "diameter_code" CHAR(3) NOT NULL,
ADD COLUMN     "diameter_mm" DECIMAL(8,3) NOT NULL,
ADD COLUMN     "kind_code" CHAR(2) NOT NULL,
ADD COLUMN     "length_mm" DECIMAL(10,3) NOT NULL,
ADD COLUMN     "length_variant_code" CHAR(3) NOT NULL,
ADD COLUMN     "manufacturer_model" TEXT,
ADD COLUMN     "nominal_diameter_mm" DECIMAL(8,3),
ADD COLUMN     "surface_finish_code" CHAR(1) NOT NULL;


-- DropEnum
DROP TYPE "app"."MATERIAL_FORM";


-- CreateTable
CREATE TABLE "app"."material_manufacturers" (
    "code" CHAR(1) NOT NULL,
    "name" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "material_manufacturers_pkey" PRIMARY KEY ("code")
);


-- CreateTable
CREATE TABLE "app"."material_manufacturer_grades" (
    "manufacturer_code" CHAR(1) NOT NULL,
    "code" CHAR(2) NOT NULL,
    "name" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "material_manufacturer_grades_pkey" PRIMARY KEY ("manufacturer_code","code")
);


-- CreateTable
CREATE TABLE "app"."material_shapes" (
    "code" CHAR(1) NOT NULL,
    "name" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "material_shapes_pkey" PRIMARY KEY ("code")
);


-- CreateTable
CREATE TABLE "app"."material_kinds" (
    "shape_code" CHAR(1) NOT NULL,
    "code" CHAR(2) NOT NULL,
    "name" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "material_kinds_pkey" PRIMARY KEY ("shape_code","code")
);


-- CreateTable
CREATE TABLE "app"."material_surface_finishes" (
    "code" CHAR(1) NOT NULL,
    "name" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "material_surface_finishes_pkey" PRIMARY KEY ("code")
);


-- CreateTable
CREATE TABLE "app"."material_diameters" (
    "code" CHAR(3) NOT NULL,
    "diameter_mm" DECIMAL(8,3) NOT NULL,
    "display_name" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "material_diameters_pkey" PRIMARY KEY ("code")
);


-- CreateTable
CREATE TABLE "app"."material_length_variants" (
    "code" CHAR(3) NOT NULL,
    "length_mm" DECIMAL(10,3) NOT NULL,
    "custom_label" TEXT,
    "display_name" JSONB,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "material_length_variants_pkey" PRIMARY KEY ("code")
);


-- CreateIndex
CREATE UNIQUE INDEX "material_types_manufacturer_code_grade_code_shape_code_kind_key" ON "app"."material_types"("manufacturer_code", "grade_code", "shape_code", "kind_code");


-- CreateIndex
CREATE UNIQUE INDEX "materials_material_type_id_surface_finish_code_diameter_cod_key" ON "app"."materials"("material_type_id", "surface_finish_code", "diameter_code", "length_variant_code");


-- AddForeignKey
ALTER TABLE "app"."material_manufacturer_grades" ADD CONSTRAINT "material_manufacturer_grades_manufacturer_code_fkey" FOREIGN KEY ("manufacturer_code") REFERENCES "app"."material_manufacturers"("code") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."material_kinds" ADD CONSTRAINT "material_kinds_shape_code_fkey" FOREIGN KEY ("shape_code") REFERENCES "app"."material_shapes"("code") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."material_types" ADD CONSTRAINT "material_types_manufacturer_code_fkey" FOREIGN KEY ("manufacturer_code") REFERENCES "app"."material_manufacturers"("code") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."material_types" ADD CONSTRAINT "material_types_manufacturer_code_grade_code_fkey" FOREIGN KEY ("manufacturer_code", "grade_code") REFERENCES "app"."material_manufacturer_grades"("manufacturer_code", "code") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."material_types" ADD CONSTRAINT "material_types_shape_code_fkey" FOREIGN KEY ("shape_code") REFERENCES "app"."material_shapes"("code") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."materials" ADD CONSTRAINT "materials_surface_finish_code_fkey" FOREIGN KEY ("surface_finish_code") REFERENCES "app"."material_surface_finishes"("code") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."materials" ADD CONSTRAINT "materials_diameter_code_fkey" FOREIGN KEY ("diameter_code") REFERENCES "app"."material_diameters"("code") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "app"."materials" ADD CONSTRAINT "materials_length_variant_code_fkey" FOREIGN KEY ("length_variant_code") REFERENCES "app"."material_length_variants"("code") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── 採番表 ver1.2 シード（冪等）───────────────────────────────────────

INSERT INTO "app"."material_manufacturers" ("code", "name", "updated_at") VALUES
  ('A', '{"ja":"アクシス","en":"Axis"}', now()),
  ('B', '{"ja":"AFC","en":"AFC"}', now()),
  ('C', '{"ja":"GESAC","en":"GESAC"}', now()),
  ('D', '{"ja":"Ceratizit","en":"Ceratizit"}', now())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "app"."material_shapes" ("code", "name", "updated_at") VALUES
  ('A', '{"ja":"通常","en":"Standard"}', now()),
  ('B', '{"ja":"OH","en":"OH"}', now()),
  ('C', '{"ja":"円筒","en":"Cylinder"}', now())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "app"."material_surface_finishes" ("code", "name", "updated_at") VALUES
  ('A', '{"ja":"黒皮","en":"Black skin"}', now()),
  ('B', '{"ja":"研磨","en":"Polished"}', now()),
  ('C', '{"ja":"研磨済黒皮","en":"Polished black skin"}', now())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "app"."material_manufacturer_grades" ("manufacturer_code", "code", "name", "updated_at") VALUES
  ('B', '01', '{"ja":"K10UF","en":"K10UF"}', now()),
  ('B', '02', '{"ja":"K40UF","en":"K40UF"}', now())
ON CONFLICT ("manufacturer_code", "code") DO NOTHING;

INSERT INTO "app"."material_kinds" ("shape_code", "code", "name", "updated_at") VALUES
  ('A', 'A0', '{"ja":"通常","en":"Standard"}', now()),
  ('B', 'B3', '{"ja":"2V30","en":"2V30"}', now()),
  ('B', 'B5', '{"ja":"CH","en":"CH"}', now())
ON CONFLICT ("shape_code", "code") DO NOTHING;
