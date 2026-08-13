-- 端末位置ログ（GPS）。キオスク端末が 5 分ごとに報告し、SY09 が最新を表示する。
-- 保持期間は pg_cron ジョブ kiosk_location_retention（90 日 — kiosk-cron.sql）。
CREATE TABLE "app"."kiosk_device_locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" UUID NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "accuracy_m" DECIMAL(8,1),
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kiosk_device_locations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kiosk_device_locations_device_id_recorded_at_idx"
    ON "app"."kiosk_device_locations"("device_id", "recorded_at" DESC);

ALTER TABLE "app"."kiosk_device_locations"
    ADD CONSTRAINT "kiosk_device_locations_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "app"."kiosk_devices"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
