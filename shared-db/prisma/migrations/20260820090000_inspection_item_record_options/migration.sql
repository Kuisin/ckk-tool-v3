-- 検査項目のオプション 2 点（いずれも既定値で従来どおり）:
-- 1. allow_manual_override — 合否の手動上書きを許可（false = 自動判定のみ。
--    基準未設定の項目は常に手動）
-- 2. record_style — 記録方式: VALUES = 製品ごとの実測値 / COUNTS = 合格数のみ
--    （検査数・合格数を record item の inspected_count / passed_count に保存）

-- CreateEnum
CREATE TYPE "app"."InspectionRecordStyle" AS ENUM ('VALUES', 'COUNTS');

-- AlterTable
ALTER TABLE "app"."inspection_template_items" ADD COLUMN     "allow_manual_override" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "record_style" "app"."InspectionRecordStyle" NOT NULL DEFAULT 'VALUES';

-- AlterTable
ALTER TABLE "app"."inspection_record_items" ADD COLUMN     "inspected_count" INTEGER,
ADD COLUMN     "passed_count" INTEGER;
