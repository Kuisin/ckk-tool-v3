-- AlterEnum
ALTER TYPE "app"."KIOSK_DEVICE_STATUS" ADD VALUE 'LINKED';

-- AlterTable
ALTER TABLE "app"."kiosk_devices" ADD COLUMN     "linked_at" TIMESTAMPTZ(6);

