-- 工程実行時のロット/伝票コード入力（打合せメモ 1/26「定尺材は伝票コード入力」対応）。
-- カタログが既定（NONE）を持ち、工程リスト・指示書工程は null = 継承の上書き列。
-- REQUIRED の工程は開始時に lot_text 未入力だとブロックされる。

-- CreateEnum
CREATE TYPE "app"."LOT_INPUT_MODE" AS ENUM ('REQUIRED', 'OPTIONAL', 'NONE');

-- AlterTable
ALTER TABLE "app"."product_process_route_version_steps" ADD COLUMN     "lot_input_mode" "app"."LOT_INPUT_MODE";

-- AlterTable
ALTER TABLE "app"."process_step_catalog" ADD COLUMN     "lot_input_mode" "app"."LOT_INPUT_MODE" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "app"."work_order_steps" ADD COLUMN     "lot_input_mode" "app"."LOT_INPUT_MODE",
ADD COLUMN     "lot_text" TEXT;
