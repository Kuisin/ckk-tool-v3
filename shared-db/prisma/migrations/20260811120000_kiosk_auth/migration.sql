-- キオスク（共有端末）認証: 端末・QRカード・セッション・フロアマップ。
-- 詳細は prisma/schema/kiosk.prisma のコメント参照。

-- CreateEnum
CREATE TYPE "app"."KIOSK_DEVICE_STATUS" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED', 'REVOKED');

-- CreateEnum
CREATE TYPE "app"."KIOSK_CARD_STATUS" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'SUSPENDED', 'REVOKED');

-- CreateTable
CREATE TABLE "app"."kiosk_floor_maps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "factory_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "file_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kiosk_floor_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."kiosk_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT,
    "location" TEXT,
    "factory_id" INTEGER,
    "floor_map_id" UUID,
    "map_x" DECIMAL(5,2),
    "map_y" DECIMAL(5,2),
    "status" "app"."KIOSK_DEVICE_STATUS" NOT NULL DEFAULT 'PENDING',
    "registration_code" TEXT,
    "registration_expires_at" TIMESTAMPTZ(6),
    "device_token_hash" TEXT,
    "device_token_expires_at" TIMESTAMPTZ(6),
    "user_agent" TEXT,
    "last_ip_address" TEXT,
    "activated_by" UUID,
    "activated_at" TIMESTAMPTZ(6),
    "last_activity_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kiosk_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."kiosk_cards" (
    "id" TEXT NOT NULL,
    "user_id" UUID,
    "status" "app"."KIOSK_CARD_STATUS" NOT NULL DEFAULT 'UNASSIGNED',
    "pin_hash" TEXT,
    "pin_set_at" TIMESTAMPTZ(6),
    "pin_failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "pin_locked_until" TIMESTAMPTZ(6),
    "pin_last_verified_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "assigned_at" TIMESTAMPTZ(6),
    "assigned_by" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kiosk_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."kiosk_sessions" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "card_id" TEXT NOT NULL,
    "device_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "kiosk_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kiosk_floor_maps_factory_id_idx" ON "app"."kiosk_floor_maps"("factory_id");

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_devices_registration_code_key" ON "app"."kiosk_devices"("registration_code");

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_devices_device_token_hash_key" ON "app"."kiosk_devices"("device_token_hash");

-- CreateIndex
CREATE INDEX "kiosk_devices_factory_id_idx" ON "app"."kiosk_devices"("factory_id");

-- CreateIndex
CREATE INDEX "kiosk_devices_status_idx" ON "app"."kiosk_devices"("status");

-- CreateIndex
CREATE INDEX "kiosk_cards_user_id_idx" ON "app"."kiosk_cards"("user_id");

-- 手書き: ASSIGNED カードは 1 ユーザー 1 枚（Prisma では partial unique を表現不可。
-- migration squash 時はこの index を必ず引き継ぐこと）
CREATE UNIQUE INDEX "kiosk_cards_one_assigned_per_user"
  ON "app"."kiosk_cards"("user_id") WHERE "status" = 'ASSIGNED';

-- CreateIndex
CREATE INDEX "kiosk_sessions_user_id_idx" ON "app"."kiosk_sessions"("user_id");

-- CreateIndex
CREATE INDEX "kiosk_sessions_device_id_idx" ON "app"."kiosk_sessions"("device_id");

-- CreateIndex
CREATE INDEX "kiosk_sessions_expires_at_idx" ON "app"."kiosk_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "app"."kiosk_floor_maps" ADD CONSTRAINT "kiosk_floor_maps_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "app"."factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."kiosk_floor_maps" ADD CONSTRAINT "kiosk_floor_maps_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "app"."files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."kiosk_devices" ADD CONSTRAINT "kiosk_devices_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "app"."factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."kiosk_devices" ADD CONSTRAINT "kiosk_devices_floor_map_id_fkey" FOREIGN KEY ("floor_map_id") REFERENCES "app"."kiosk_floor_maps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."kiosk_devices" ADD CONSTRAINT "kiosk_devices_activated_by_fkey" FOREIGN KEY ("activated_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."kiosk_cards" ADD CONSTRAINT "kiosk_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."kiosk_cards" ADD CONSTRAINT "kiosk_cards_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."kiosk_cards" ADD CONSTRAINT "kiosk_cards_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."kiosk_sessions" ADD CONSTRAINT "kiosk_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."kiosk_sessions" ADD CONSTRAINT "kiosk_sessions_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "app"."kiosk_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."kiosk_sessions" ADD CONSTRAINT "kiosk_sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "app"."kiosk_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

