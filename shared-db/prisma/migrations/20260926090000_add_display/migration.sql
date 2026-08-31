-- 管理ディスプレイ（デジタルサイネージ）— 現場の壁掛けテレビへ生産状況を出す基盤。
--
-- Raspberry Pi は固定 URL を開くだけのブラウザで、何を映すかはこの 3 表が決める。
-- Pi 側に設定を持たせないのが芯 — 持たせた瞬間、台数ぶんの設定が現場に散る。
--
-- **登録の流れはキオスク端末（kiosk_devices）と同じ** profile-first:
--   ① 管理者が SY09 でプロファイルを作る（PENDING = オープン）
--   ② 画面がリンクコードを出す（display_link_requests・12桁・10分）
--   ③ 管理者が SY09 で読み取ってオープンなプロファイルへ結ぶ（LINKED）
--   ④ 管理者が有効化する（ACTIVE）→ 画面が自分でトークンを受け取る
-- 端末とディスプレイで手順を変えないのは、覚えることを増やさないため。
-- 同じ画面・同じスキャナ・同じ 3 段で扱える。
--
-- キオスクと違うのは **遷移ログを持たない**点だけ（kiosk_device_logs 相当は
-- 作らない）。あれはフロア端末の使用実態を追うためのもので、誰も触らない
-- 掲示板には要らない。死活は last_seen_at 1 列から読むときに計算する。
--
-- 期限切れのリンクコードは API の入口が掃除する。pg_cron を増やさないのは、
-- 掃除が遅れても害が無いため（増えるのは行だけ）。
--
-- 生の秘密（リンクコード・トークンハッシュ）を持つので、grants.sql で
-- metabase_ro から落とす（表ごと / 列単位）。個人データは持たない。

-- CreateEnum
CREATE TYPE "app"."DISPLAY_DEVICE_STATUS" AS ENUM ('PENDING', 'LINKED', 'ACTIVE', 'DISABLED', 'REVOKED');

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
    "status" "app"."DISPLAY_DEVICE_STATUS" NOT NULL DEFAULT 'PENDING',
    "device_token_hash" TEXT,
    "device_token_expires_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6),
    "last_ip_address" TEXT,
    "user_agent" TEXT,
    "app_version" VARCHAR(40),
    "linked_at" TIMESTAMPTZ(6),
    "activated_by" UUID,
    "activated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "display_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."display_link_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "device_id" UUID,
    "user_agent" TEXT,
    "last_ip_address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "display_link_requests_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "display_link_requests_code_key" ON "app"."display_link_requests"("code");

-- CreateIndex
CREATE INDEX "display_link_requests_expires_at_idx" ON "app"."display_link_requests"("expires_at");

-- AddForeignKey
ALTER TABLE "app"."display_profiles" ADD CONSTRAINT "display_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."display_devices" ADD CONSTRAINT "display_devices_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "app"."plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."display_devices" ADD CONSTRAINT "display_devices_display_profile_id_fkey" FOREIGN KEY ("display_profile_id") REFERENCES "app"."display_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."display_devices" ADD CONSTRAINT "display_devices_activated_by_fkey" FOREIGN KEY ("activated_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."display_link_requests" ADD CONSTRAINT "display_link_requests_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "app"."display_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
