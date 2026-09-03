-- AlterTable
ALTER TABLE "app"."form_versions" ADD COLUMN     "sections" JSONB NOT NULL DEFAULT '[]';
