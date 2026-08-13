-- 工程ごとの任意の作業時間 (h):
--   工程マスタの既定値 → 製品工程ルートの標準値 → 指示書工程の予定値（上書き可）
-- 追加のみ — 既存行はすべて NULL（未設定）で従来どおり。

-- AlterTable
ALTER TABLE "app"."process_step_catalog" ADD COLUMN     "default_work_hours" DECIMAL(6,2);

-- AlterTable
ALTER TABLE "app"."product_process_route_version_steps" ADD COLUMN     "work_hours" DECIMAL(6,2);

-- AlterTable
ALTER TABLE "app"."work_order_steps" ADD COLUMN     "planned_work_hours" DECIMAL(6,2);
