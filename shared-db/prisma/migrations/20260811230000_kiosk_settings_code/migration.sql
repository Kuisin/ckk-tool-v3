-- AlterTable: 端末設定画面（5タップ）の解錠コード。volatile default なので
-- 既存行にも行ごとに異なる 6 桁コードが払い出される。
ALTER TABLE "app"."kiosk_devices" ADD COLUMN "settings_code" TEXT NOT NULL DEFAULT lpad(floor(random() * 1000000)::text, 6, '0');
