-- DropIndex
DROP INDEX "app"."kiosk_devices_registration_code_key";

-- AlterTable
ALTER TABLE "app"."kiosk_devices" DROP COLUMN "registration_code",
DROP COLUMN "registration_expires_at";

-- CreateTable
CREATE TABLE "app"."kiosk_link_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "device_id" UUID,
    "user_agent" TEXT,
    "last_ip_address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kiosk_link_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_link_requests_code_key" ON "app"."kiosk_link_requests"("code");

-- CreateIndex
CREATE INDEX "kiosk_link_requests_expires_at_idx" ON "app"."kiosk_link_requests"("expires_at");

-- AddForeignKey
ALTER TABLE "app"."kiosk_link_requests" ADD CONSTRAINT "kiosk_link_requests_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "app"."kiosk_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

