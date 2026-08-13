-- 工程の不良理由の内訳（キオスク完了時の補助記録）。
-- 形: [{ reason: string, count: int }]。在庫連携には使わない
-- （区分 output_defect_semi_finished / _scrap / _rework が数量の権威）。

-- AlterTable
ALTER TABLE "app"."work_order_steps" ADD COLUMN "defect_reasons" JSONB;
