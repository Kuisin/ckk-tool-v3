-- 同時作業の実績按分（打合せメモ 1/28「同期する工程」対応）。
-- 1 実績行 = 一定の同時数を持つ作業セグメント。実働時間 = duration / concurrent_count。
-- 既存行は「同時 1 工程」制限下のデータなので DEFAULT 1 のままで正しい（backfill 不要）。

-- AlterTable
ALTER TABLE "app"."work_order_step_actuals" ADD COLUMN     "concurrent_count" INTEGER NOT NULL DEFAULT 1;
