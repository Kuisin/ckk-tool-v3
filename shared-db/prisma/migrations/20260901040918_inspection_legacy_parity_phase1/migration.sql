-- CreateEnum
CREATE TYPE "app"."InspectionLayoutStyle" AS ENUM ('DIMENSIONAL', 'CHECKLIST');

-- CreateEnum
CREATE TYPE "app"."InspectionSampleNaming" AS ENUM ('GENERIC', 'INITIAL_MID_FINAL');

-- CreateEnum
CREATE TYPE "app"."InspectionItemSection" AS ENUM ('MEASUREMENT', 'SHAPE');

-- CreateEnum
CREATE TYPE "app"."InspectionDepartment" AS ENUM ('MANUFACTURING', 'QUALITY_ASSURANCE');

-- AlterEnum
ALTER TYPE "app"."InspectionItemType" ADD VALUE 'TEXT';

-- AlterTable
ALTER TABLE "app"."inspection_records" ADD COLUMN     "confirmed_at" TIMESTAMPTZ(6),
ADD COLUMN     "confirmed_by" UUID;

-- AlterTable
ALTER TABLE "app"."inspection_template_items" ADD COLUMN     "department" "app"."InspectionDepartment",
ADD COLUMN     "measurement_equipment" TEXT,
ADD COLUMN     "nominal_value" DECIMAL(12,4),
ADD COLUMN     "section" "app"."InspectionItemSection" NOT NULL DEFAULT 'MEASUREMENT',
ADD COLUMN     "tolerance_bottom_delta" DECIMAL(12,4),
ADD COLUMN     "tolerance_top_delta" DECIMAL(12,4);

-- AlterTable
ALTER TABLE "app"."inspection_templates" ADD COLUMN     "layout_style" "app"."InspectionLayoutStyle" NOT NULL DEFAULT 'DIMENSIONAL',
ADD COLUMN     "sample_naming" "app"."InspectionSampleNaming" NOT NULL DEFAULT 'GENERIC';

-- CreateTable
CREATE TABLE "app"."work_order_final_inspections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL,
    "drawing_label_ok" BOOLEAN,
    "drawing_label_checked_by" UUID,
    "drawing_label_checked_at" TIMESTAMPTZ(6),
    "protective_cap_ok" BOOLEAN,
    "protective_cap_checked_by" UUID,
    "protective_cap_checked_at" TIMESTAMPTZ(6),
    "finished_quantity_ok" BOOLEAN,
    "finished_quantity_checked_by" UUID,
    "finished_quantity_checked_at" TIMESTAMPTZ(6),
    "spare_stock_used" BOOLEAN NOT NULL DEFAULT false,
    "spare_stock_received" BOOLEAN NOT NULL DEFAULT false,
    "shelved_by" UUID,
    "shelved_at" TIMESTAMPTZ(6),
    "delivery_note_issued_by" UUID,
    "delivery_note_issued_at" TIMESTAMPTZ(6),
    "shipment_authorized_by" UUID,
    "shipment_authorized_at" TIMESTAMPTZ(6),
    "ship_defect_reviewed_by" UUID,
    "ship_defect_reviewed_at" TIMESTAMPTZ(6),
    "ship_defect_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "work_order_final_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_order_final_inspections_work_order_id_key" ON "app"."work_order_final_inspections"("work_order_id");

-- AddForeignKey
ALTER TABLE "app"."work_order_final_inspections" ADD CONSTRAINT "work_order_final_inspections_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "app"."work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
