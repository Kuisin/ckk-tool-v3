-- AlterTable
ALTER TABLE "app"."inspection_templates" ADD COLUMN     "group_id" INTEGER,
ADD COLUMN     "image_file_id" UUID,
ADD COLUMN     "product_id" INTEGER;

-- CreateTable
CREATE TABLE "app"."inspection_template_groups" (
    "id" SERIAL NOT NULL,
    "name" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inspection_template_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inspection_templates_product_id_idx" ON "app"."inspection_templates"("product_id");

-- CreateIndex
CREATE INDEX "inspection_templates_group_id_idx" ON "app"."inspection_templates"("group_id");

-- AddForeignKey
ALTER TABLE "app"."inspection_templates" ADD CONSTRAINT "inspection_templates_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."inspection_templates" ADD CONSTRAINT "inspection_templates_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "app"."inspection_template_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."inspection_templates" ADD CONSTRAINT "inspection_templates_image_file_id_fkey" FOREIGN KEY ("image_file_id") REFERENCES "app"."files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
