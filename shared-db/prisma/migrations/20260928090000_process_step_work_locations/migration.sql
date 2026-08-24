-- 工程マスタの許可作業場所 + キオスク端末の「作業場所の制限」トグル
--   1. process_step_work_locations — 工程で使える作業場所の許可リスト
--      （種別 or 個別のどちらか一方。行が無い工程は無制限）。
--      計画・実績の両方の入力検証と選択肢の絞り込みに使う。
--   2. kiosk_devices.enforce_work_location — ON のとき、許可作業場所のある
--      工程は端末の既定作業場所が許可に含まれる場合のみ 開始/再開 できる。

-- CreateTable
CREATE TABLE "app"."process_step_work_locations" (
    "id" SERIAL NOT NULL,
    "process_step_id" INTEGER NOT NULL,
    "type_key" TEXT,
    "work_location_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "process_step_work_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "process_step_work_locations_process_step_id_idx" ON "app"."process_step_work_locations"("process_step_id");

-- CreateIndex
CREATE INDEX "process_step_work_locations_work_location_id_idx" ON "app"."process_step_work_locations"("work_location_id");

-- AddForeignKey
ALTER TABLE "app"."process_step_work_locations" ADD CONSTRAINT "process_step_work_locations_process_step_id_fkey" FOREIGN KEY ("process_step_id") REFERENCES "app"."process_step_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."process_step_work_locations" ADD CONSTRAINT "process_step_work_locations_work_location_id_fkey" FOREIGN KEY ("work_location_id") REFERENCES "app"."work_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 種別 or 個別のどちらか一方だけ（両方 null / 両方非 null を禁止）。
-- Prisma スキーマでは表現できないため SQL で担保する。
ALTER TABLE "app"."process_step_work_locations"
  ADD CONSTRAINT "process_step_work_locations_one_of_check"
  CHECK (("type_key" IS NULL) <> ("work_location_id" IS NULL));

-- AlterTable
ALTER TABLE "app"."kiosk_devices" ADD COLUMN "enforce_work_location" BOOLEAN NOT NULL DEFAULT false;
