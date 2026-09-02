-- AlterTable
ALTER TABLE "app"."inspection_templates" ADD COLUMN     "approval_group_id" INTEGER;

-- AddForeignKey
ALTER TABLE "app"."inspection_templates" ADD CONSTRAINT "inspection_templates_approval_group_id_fkey" FOREIGN KEY ("approval_group_id") REFERENCES "app"."approval_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
