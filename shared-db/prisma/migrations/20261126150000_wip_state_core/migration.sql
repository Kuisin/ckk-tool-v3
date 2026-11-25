-- 仕掛品の再設計 第 1 段（PR 1/7）: 型と列だけ。**振る舞いは 1 つも変わらない。**
--
-- 途中まで加工した品（半製品）は今、製品の品目に is_semi_finished の印を付けて
-- ロット単位で積んでいる。これだと「どこまで加工したか」が分からず、別の指示書で
-- 使い回せない。再設計では
--   - 品物は材種 × 径 × 長 の**仕掛ブランク**（items.item_type = 'BLANK'）に置き、
--   - どこまで加工したかを**加工状態**（wip_states = 済んだ形を変える工程の並び）で持ち、
--   - 研削後の仕上がり寸法と、目指していた製品（目標製品）をバケットに添える。
-- この段では入れ物を作るだけで、誰もまだ書かない（埋めるのは backfill の段、
-- 計上を切り替えるのはその次の段）。
--
-- ローリングデプロイ: 列・表・enum 値は足すだけ。旧アプリは知らないので触らない。
-- バケットの一意キーに足す列はすべて NULL で、NULLS NOT DISTINCT のままなので
-- 既存行の一意性は 1 ミリも変わらない（20261106090000_regrind_owner_stock と同じ手順）。
--
-- 新しい enum 値（BLANK）はこの migration の中で使わない — Prisma は 1 ファイルを
-- 1 トランザクションに包み、ADD VALUE した値はコミットまで使えない。BLANK だけの
-- 部分 unique index は次の migration（20261126150001_wip_state_blank_index）。

ALTER TYPE "app"."ITEM_TYPE" ADD VALUE IF NOT EXISTS 'BLANK';

-- ── 工程マスタ: 加工状態に数える工程か ───────────────────────────────────────
-- 既定はカテゴリから: 材料準備・加工・コーティングは品物の形を変える。
-- 検査・承認・出荷・再研磨は数えない（再研磨は顧客の物で、仕掛品にならない）。
-- 開始工程（出し・受渡し・製品受入）は在庫を動かすだけなので常に false
-- （lib/workflow-core.ts START_STEP_CODES と同じ 6 つ）。
ALTER TABLE "app"."process_step_catalog"
  ADD COLUMN "affects_wip_state" BOOLEAN NOT NULL DEFAULT false;

UPDATE "app"."process_step_catalog"
   SET "affects_wip_state" = true
 WHERE "category" IN ('MATERIAL_PREP', 'MACHINING', 'COATING')
   AND "code" NOT IN ('MATERIAL_ISSUE', 'SEMI_FINISHED_ISSUE', 'MATERIAL_HANDOFF',
                      'PRODUCT_HANDOFF', 'PRODUCT_ISSUE', 'REGRIND_RECEIPT');

-- ── 加工状態 ─────────────────────────────────────────────────────────────────
CREATE TABLE "app"."wip_states" (
    "id" SERIAL NOT NULL,
    "step_ids" INTEGER[] NOT NULL,
    "signature" TEXT NOT NULL,
    "name" JSONB,
    "is_legacy" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wip_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wip_states_signature_key" ON "app"."wip_states"("signature");

-- ── 在庫バケット: 加工状態・目標製品・仕上がり寸法 ───────────────────────────
ALTER TABLE "app"."item_inventory"
  ADD COLUMN "wip_state_id" INTEGER,
  ADD COLUMN "aimed_item_id" INTEGER,
  ADD COLUMN "finished_diameter_mm" DECIMAL(8,3),
  ADD COLUMN "finished_length_mm" DECIMAL(10,3);

ALTER TABLE "app"."item_inventory"
  ADD CONSTRAINT "item_inventory_wip_state_id_fkey"
  FOREIGN KEY ("wip_state_id") REFERENCES "app"."wip_states"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."item_inventory"
  ADD CONSTRAINT "item_inventory_aimed_item_id_fkey"
  FOREIGN KEY ("aimed_item_id") REFERENCES "app"."items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "item_inventory_wip_state_id_idx" ON "app"."item_inventory"("wip_state_id");
CREATE INDEX "item_inventory_aimed_item_id_idx" ON "app"."item_inventory"("aimed_item_id");

-- 加工状態を持つ行は顧客の預り品ではない。預り品は顧客の物で、仕掛品として
-- 別の製品へ回してよい在庫ではない。
-- `is_semi_finished = (wip_state_id IS NOT NULL)` はまだ張らない — 既存の半製品
-- 行は wip_state_id が NULL のままで、埋めるのは次の段（backfill）。
ALTER TABLE "app"."item_inventory"
  ADD CONSTRAINT "item_inventory_wip_not_owned"
  CHECK ("wip_state_id" IS NULL OR "owner_bp_id" IS NULL);

-- バケットの一意キーに 4 列を足す。**NULLS NOT DISTINCT のまま**。
DROP INDEX "app"."item_inventory_bucket_key";
CREATE UNIQUE INDEX "item_inventory_bucket_key"
  ON "app"."item_inventory" ("item_id", "plant_id", "lot_number", "is_semi_finished",
                             "storage_location_id", "shelf_id", "custody_bp_id", "owner_bp_id",
                             "wip_state_id", "aimed_item_id",
                             "finished_diameter_mm", "finished_length_mm")
  NULLS NOT DISTINCT;
