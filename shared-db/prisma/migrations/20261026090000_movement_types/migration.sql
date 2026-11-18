-- 移動タイプ app.movement_types — 手動で在庫を動かすときに選ぶ番号つきの型。
--
-- **cause（INVENTORY_MOVEMENT_CAUSE）を置き換えるものではない。**
--   cause         … どの処理が起こしたか（システム側の分類・不変の enum）
--   movement_type … 業務としてどの型の入出庫か（利用者が増やせる番号）
-- 兼ねさせると、自動生成の伝票（指示書完了・出荷・入荷）に人が決めた番号を
-- 無理に割り当てることになる。自動は cause だけ、手動は両方を持つ。

-- CreateEnum
CREATE TYPE "app"."MOVEMENT_DIRECTION" AS ENUM ('IN', 'OUT', 'TRANSFER');

-- CreateTable
CREATE TABLE "app"."movement_types" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "direction" "app"."MOVEMENT_DIRECTION" NOT NULL,
    "requires_from" BOOLEAN NOT NULL DEFAULT false,
    "requires_to" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "movement_types_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "app"."inventory_movements" ADD COLUMN "movement_type_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "movement_types_code_key" ON "app"."movement_types"("code");
CREATE INDEX "movement_types_is_active_sort_order_idx" ON "app"."movement_types"("is_active", "sort_order");
CREATE INDEX "inventory_movements_movement_type_id_idx" ON "app"."inventory_movements"("movement_type_id");

-- AddForeignKey
ALTER TABLE "app"."inventory_movements" ADD CONSTRAINT "inventory_movements_movement_type_id_fkey" FOREIGN KEY ("movement_type_id") REFERENCES "app"."movement_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 既定の型 ───────────────────────────────────────────────────────────────
-- SAP の番号体系に寄せた 4 本だけを入れる。現場の呼び方は会社ごとに違うので、
-- 足りないぶんは設定画面（ST09）から増やす前提。
-- **使用済みの型は消せない**（伝票が指しているため FK が Restrict で止める）—
-- 使わなくなったら is_active = false に倒す。
INSERT INTO "app"."movement_types"
  ("code", "name", "direction", "requires_from", "requires_to", "sort_order", "notes", "updated_at")
VALUES
  ('101', '{"ja":"入庫","en":"Goods receipt","zh":"入库"}',            'IN',       false, true,  10,
   '仕入・返却などで在庫が増えるとき。入庫先は必ず記録する。', now()),
  ('201', '{"ja":"出庫","en":"Goods issue","zh":"出库"}',              'OUT',      true,  false, 20,
   '消費・持ち出しなどで在庫が減るとき。出庫元は必ず記録する。', now()),
  ('311', '{"ja":"保管場所間移動","en":"Transfer","zh":"库存调拨"}',   'TRANSFER', true,  true,  30,
   '拠点・保管場所・棚の間で動かすとき。元と先の両方を記録する。', now()),
  ('551', '{"ja":"廃棄","en":"Scrapping","zh":"报废"}',                'OUT',      true,  false, 40,
   '不良・破損で捨てるとき。出庫元を記録する。', now());
