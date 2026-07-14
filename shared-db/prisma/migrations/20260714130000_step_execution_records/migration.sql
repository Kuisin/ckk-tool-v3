-- CreateEnum
CREATE TYPE "app"."INSPECTION_STATUS" AS ENUM ('PENDING', 'PASS', 'FAIL', 'APPROVED');
-- CreateTable
CREATE TABLE "app"."inspection_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_step_id" UUID NOT NULL,
    "template_id" INTEGER NOT NULL,
    "status" "app"."INSPECTION_STATUS" NOT NULL DEFAULT 'PENDING',
    "recorded_by" UUID,
    "approved_by" UUID,
    "recorded_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    CONSTRAINT "inspection_records_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."inspection_record_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inspection_record_id" UUID NOT NULL,
    "template_item_id" INTEGER NOT NULL,
    "measured_value" TEXT,
    "is_pass" BOOLEAN,
    "notes" TEXT,
    CONSTRAINT "inspection_record_items_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."defect_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_step_id" UUID NOT NULL,
    "defect_type_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "recorded_by" UUID,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "defect_records_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "inspection_records_work_order_step_id_idx" ON "app"."inspection_records"("work_order_step_id");
-- CreateIndex
CREATE INDEX "inspection_record_items_inspection_record_id_idx" ON "app"."inspection_record_items"("inspection_record_id");
-- CreateIndex
CREATE INDEX "defect_records_work_order_step_id_idx" ON "app"."defect_records"("work_order_step_id");
-- AddForeignKey
ALTER TABLE "app"."inspection_records" ADD CONSTRAINT "inspection_records_work_order_step_id_fkey" FOREIGN KEY ("work_order_step_id") REFERENCES "app"."work_order_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."inspection_records" ADD CONSTRAINT "inspection_records_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "app"."inspection_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."inspection_record_items" ADD CONSTRAINT "inspection_record_items_inspection_record_id_fkey" FOREIGN KEY ("inspection_record_id") REFERENCES "app"."inspection_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."inspection_record_items" ADD CONSTRAINT "inspection_record_items_template_item_id_fkey" FOREIGN KEY ("template_item_id") REFERENCES "app"."inspection_template_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."defect_records" ADD CONSTRAINT "defect_records_work_order_step_id_fkey" FOREIGN KEY ("work_order_step_id") REFERENCES "app"."work_order_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."defect_records" ADD CONSTRAINT "defect_records_defect_type_id_fkey" FOREIGN KEY ("defect_type_id") REFERENCES "app"."defect_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
