-- 管理ディスプレイ（デジタルサイネージ）— 現場の壁掛けテレビへ生産状況を出す基盤。
--
-- Raspberry Pi は固定 URL を開くだけのブラウザで、何を映すかはこの 3 表が決める。
-- Pi 側に設定を持たせないのが芯 — 持たせた瞬間、台数ぶんの設定が現場に散る。
--
-- キオスク端末（kiosk_devices）と似ているが 2 点わざと違える:
--   1. code-first。据付作業者が脚立の上で 1 人で完了できることを優先するので、
--      行はペアリング成立時に初めて生まれる（PENDING / LINKED 相当を持たない）。
--   2. 遷移ログを持たない。死活は last_seen_at 1 列から読むときに計算する。
--
-- 期限切れのペアリングは POST /api/display/pairing が入口で掃除する（pg_cron を
-- 増やさない — キオスクの setup/begin と同じやり方）。
--
-- 生の秘密（ペアリングコード・トークンハッシュ）を持つので、grants.sql で
-- metabase_ro から落とす（表ごと / 列単位）。個人データは持たない。

-- CreateEnum
CREATE TYPE "app"."DISPLAY_DEVICE_STATUS" AS ENUM ('ACTIVE', 'DISABLED', 'REVOKED');

-- CreateEnum
CREATE TYPE "app"."DISPLAY_CONTENT_TYPE" AS ENUM ('APP_PAGE', 'METABASE', 'URL', 'IMAGE');

-- CreateTable
CREATE TABLE "app"."display_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" JSONB NOT NULL,
    "description" TEXT,
    "content_type" "app"."DISPLAY_CONTENT_TYPE" NOT NULL,
    "content_config" JSONB NOT NULL DEFAULT '{}',
    "refresh_interval_sec" INTEGER NOT NULL DEFAULT 60,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "display_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."display_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" JSONB,
    "location" TEXT,
    "plant_id" INTEGER,
    "display_profile_id" UUID,
    "status" "app"."DISPLAY_DEVICE_STATUS" NOT NULL DEFAULT 'ACTIVE',
    "device_token_hash" TEXT,
    "device_token_expires_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6),
    "last_ip_address" TEXT,
    "user_agent" TEXT,
    "app_version" VARCHAR(40),
    "paired_by" UUID,
    "paired_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "display_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."display_pairing_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "display_device_id" UUID,
    "user_agent" TEXT,
    "last_ip_address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "display_pairing_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "display_profiles_content_type_idx" ON "app"."display_profiles"("content_type");

-- CreateIndex
CREATE UNIQUE INDEX "display_devices_device_token_hash_key" ON "app"."display_devices"("device_token_hash");

-- CreateIndex
CREATE INDEX "display_devices_plant_id_idx" ON "app"."display_devices"("plant_id");

-- CreateIndex
CREATE INDEX "display_devices_status_idx" ON "app"."display_devices"("status");

-- CreateIndex
CREATE INDEX "display_devices_display_profile_id_idx" ON "app"."display_devices"("display_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "display_pairing_sessions_code_key" ON "app"."display_pairing_sessions"("code");

-- CreateIndex
CREATE INDEX "display_pairing_sessions_expires_at_idx" ON "app"."display_pairing_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "app"."display_profiles" ADD CONSTRAINT "display_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."display_devices" ADD CONSTRAINT "display_devices_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "app"."plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."display_devices" ADD CONSTRAINT "display_devices_display_profile_id_fkey" FOREIGN KEY ("display_profile_id") REFERENCES "app"."display_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."display_devices" ADD CONSTRAINT "display_devices_paired_by_fkey" FOREIGN KEY ("paired_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."display_pairing_sessions" ADD CONSTRAINT "display_pairing_sessions_display_device_id_fkey" FOREIGN KEY ("display_device_id") REFERENCES "app"."display_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
