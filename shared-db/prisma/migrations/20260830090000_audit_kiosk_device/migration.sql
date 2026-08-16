-- 操作履歴にキオスク端末を記録する（共有タブレットからの操作のみ。Web は null）。
-- 「誰が」だけでなく「どの端末で」を残し、履歴一覧・履歴タブで端末名バッジを出す。

-- AlterTable
ALTER TABLE "app"."audit_logs" ADD COLUMN "kiosk_device_id" UUID;

-- CreateIndex
CREATE INDEX "audit_logs_kiosk_device_id_idx" ON "app"."audit_logs"("kiosk_device_id");

-- AddForeignKey
ALTER TABLE "app"."audit_logs" ADD CONSTRAINT "audit_logs_kiosk_device_id_fkey" FOREIGN KEY ("kiosk_device_id") REFERENCES "app"."kiosk_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
