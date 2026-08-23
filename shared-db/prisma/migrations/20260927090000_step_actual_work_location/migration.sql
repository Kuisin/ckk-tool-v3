-- 作業実績への作業場所 + キオスク端末の既定作業場所
--   1. work_order_step_actuals.work_location_id — 実績にも作業場所を記録する
--      （計画側 work_order_step_plans.work_location_id と対）。キオスクの
--      開始/再開 は端末の既定作業場所を書き込む。
--   2. kiosk_devices.default_work_location_id — 端末ごとの既定作業場所。
--      端末設定画面（設定コード認証）と SY09 の両方から変更できる。

-- AlterTable
ALTER TABLE "app"."work_order_step_actuals" ADD COLUMN "work_location_id" INTEGER;

-- AlterTable
ALTER TABLE "app"."kiosk_devices" ADD COLUMN "default_work_location_id" INTEGER;

-- AddForeignKey
ALTER TABLE "app"."work_order_step_actuals" ADD CONSTRAINT "work_order_step_actuals_work_location_id_fkey" FOREIGN KEY ("work_location_id") REFERENCES "app"."work_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."kiosk_devices" ADD CONSTRAINT "kiosk_devices_default_work_location_id_fkey" FOREIGN KEY ("default_work_location_id") REFERENCES "app"."work_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
