-- 検査表テンプレート拡張: 項目の型（真偽/数値/単一・複数選択）・合格/目標値・
-- 抜取検査（全数/割合/本数）・テンプレートのバージョン管理・記録の複数実測値。
-- 追加のみ — 既存行は input_type=NUMBER / sampling_mode=ALL / version=1 で従来どおり。

-- CreateEnum
CREATE TYPE "app"."InspectionItemType" AS ENUM ('BOOLEAN', 'NUMBER', 'SELECT_SINGLE', 'SELECT_MULTI');

-- CreateEnum
CREATE TYPE "app"."InspectionSamplingMode" AS ENUM ('ALL', 'PERCENT', 'COUNT');

-- DropIndex（code 単独 unique → (code, version) unique）
DROP INDEX "app"."inspection_templates_code_key";

-- AlterTable
ALTER TABLE "app"."inspection_templates" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "app"."inspection_template_items" ADD COLUMN     "accept_bool" BOOLEAN,
ADD COLUMN     "accept_options" JSONB,
ADD COLUMN     "goal_value" JSONB,
ADD COLUMN     "input_type" "app"."InspectionItemType" NOT NULL DEFAULT 'NUMBER',
ADD COLUMN     "options" JSONB,
ADD COLUMN     "sampling_mode" "app"."InspectionSamplingMode" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "sampling_value" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "app"."inspection_record_items" ADD COLUMN     "measured_values" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "inspection_templates_code_version_key" ON "app"."inspection_templates"("code", "version");
