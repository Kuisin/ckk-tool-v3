-- CreateEnum
CREATE TYPE "app"."KIOSK_DEVICE_LOG_TYPE" AS ENUM ('ONLINE', 'OFFLINE', 'LOGIN', 'LOGOUT');

-- CreateTable
CREATE TABLE "app"."kiosk_device_logs" (
    "id" BIGSERIAL NOT NULL,
    "device_id" UUID NOT NULL,
    "type" "app"."KIOSK_DEVICE_LOG_TYPE" NOT NULL,
    "user_id" UUID,
    "source" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kiosk_device_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kiosk_device_logs_device_id_created_at_idx" ON "app"."kiosk_device_logs"("device_id", "created_at");

-- CreateIndex
CREATE INDEX "kiosk_device_logs_created_at_idx" ON "app"."kiosk_device_logs"("created_at");

-- AddForeignKey
ALTER TABLE "app"."kiosk_device_logs" ADD CONSTRAINT "kiosk_device_logs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "app"."kiosk_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."kiosk_device_logs" ADD CONSTRAINT "kiosk_device_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
