-- AlterTable
ALTER TABLE "app"."kiosk_devices" ADD COLUMN     "device_public_key" TEXT,
ADD COLUMN     "fingerprint" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_devices_fingerprint_key" ON "app"."kiosk_devices"("fingerprint");

