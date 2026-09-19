-- 統合在庫 app.item_inventory（統合の第 2 段 A-1 = 鏡を作る）。
--
-- product_inventory と material_inventory を 1 本にまとめる。この段ではまだ
-- **鏡**で、書き込みの持ち主は旧 2 表のほう。アプリは従来どおり動く。
--
--   A-1（ここ） item_inventory を作る + 流し込む + トリガーで同期
--   A-2         lib/inventory.ts と在庫画面を item_inventory へ移し、トリガーを止める
--   A-3         inventory_id を持つ 3 表に FK を張る
--
-- ## uuid のおかげで id を持ち込める
--
-- 旧 2 表の主キーは uuid で衝突しない。**両方の id をそのまま持ち込む**ので、
--   inventory_transactions.inventory_id
--   inventory_reservations.inventory_id
--   stock_take_lines.inventory_id
-- は 1 行も書き換えずに有効なまま。masters（items）は serial で衝突したため
-- 新しく採り直したが、ここはその必要が無い。
--
-- ## 数量の型を Decimal に寄せた
--
-- 製品在庫は Int、素材在庫は Decimal(12,3) だった。int は Decimal に損なく
-- 入る（逆は入らない）ので Decimal に揃える。読み出し側は Number() が要る —
-- A-2 で画面を移すときに一緒に見る。
--
-- ## 単位
--
-- 素材在庫は行に unit を持っていて、「本」の台帳に「kg」を足すのを拒む守りが
-- それに依っている（ensureMaterialInventory の unitMismatch）。製品在庫は
-- 持っていなかったので、**品目マスタの unit を流し込む**。

-- CreateTable
CREATE TABLE "app"."item_inventory" (
    "id" UUID NOT NULL,
    "item_id" INTEGER NOT NULL,
    "plant_id" INTEGER,
    "storage_location_id" INTEGER,
    "shelf_id" INTEGER,
    "lot_number" INTEGER,
    "is_semi_finished" BOOLEAN NOT NULL DEFAULT false,
    "source_step_id" UUID,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reserved_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "item_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "item_inventory_item_id_idx" ON "app"."item_inventory"("item_id");
CREATE INDEX "item_inventory_plant_id_storage_location_id_idx" ON "app"."item_inventory"("plant_id", "storage_location_id");
CREATE INDEX "item_inventory_updated_at_id_idx" ON "app"."item_inventory"("updated_at", "id");

-- バケットの一意性。**NULLS NOT DISTINCT** でないと、保管場所・棚・ロットが
-- null の未割当バケットが何行でも作れてしまう（旧 2 表と同じ扱い）。
CREATE UNIQUE INDEX "item_inventory_bucket_key"
  ON "app"."item_inventory" ("item_id", "plant_id", "lot_number", "is_semi_finished", "storage_location_id", "shelf_id")
  NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "app"."item_inventory" ADD CONSTRAINT "item_inventory_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "app"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."item_inventory" ADD CONSTRAINT "item_inventory_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "app"."plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."item_inventory" ADD CONSTRAINT "item_inventory_storage_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "app"."storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."item_inventory" ADD CONSTRAINT "item_inventory_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "app"."storage_shelves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 同期関数 ───────────────────────────────────────────────────────────────
--
-- 旧 2 表を書いたら item_inventory も揃える。id は**旧行の id をそのまま**使う
-- ので、対応表は要らない。

CREATE OR REPLACE FUNCTION "app".sync_item_inventory_from_product() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_item_id int;
  v_unit    text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM app.item_inventory WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  -- 製品在庫は unit を持たないので、品目マスタから引く。
  SELECT p.item_id, i.unit INTO v_item_id, v_unit
  FROM app.products p JOIN app.items i ON i.id = p.item_id
  WHERE p.id = NEW.product_id;

  -- 品目がまだ無い（items の流し込み前に作られた行）なら何もしない。
  IF v_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO app.item_inventory (
    id, item_id, plant_id, storage_location_id, shelf_id,
    lot_number, is_semi_finished, source_step_id,
    quantity, reserved_quantity, unit, location, notes, updated_at
  ) VALUES (
    NEW.id, v_item_id, NEW.plant_id, NEW.storage_location_id, NEW.shelf_id,
    NEW.lot_number, NEW.is_semi_finished, NEW.source_step_id,
    NEW.quantity, NEW.reserved_quantity, v_unit, NEW.location, NEW.notes, NEW.updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    item_id = EXCLUDED.item_id, plant_id = EXCLUDED.plant_id,
    storage_location_id = EXCLUDED.storage_location_id, shelf_id = EXCLUDED.shelf_id,
    lot_number = EXCLUDED.lot_number, is_semi_finished = EXCLUDED.is_semi_finished,
    source_step_id = EXCLUDED.source_step_id,
    quantity = EXCLUDED.quantity, reserved_quantity = EXCLUDED.reserved_quantity,
    unit = EXCLUDED.unit, location = EXCLUDED.location, notes = EXCLUDED.notes,
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION "app".sync_item_inventory_from_material() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_item_id int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM app.item_inventory WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT m.item_id INTO v_item_id FROM app.materials m WHERE m.id = NEW.material_id;
  IF v_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO app.item_inventory (
    id, item_id, plant_id, storage_location_id, shelf_id,
    lot_number, is_semi_finished, source_step_id,
    quantity, reserved_quantity, unit, location, notes, updated_at
  ) VALUES (
    NEW.id, v_item_id, NEW.plant_id, NEW.storage_location_id, NEW.shelf_id,
    NULL, false, NULL,
    NEW.quantity, NEW.reserved_quantity, NEW.unit, NEW.location, NEW.notes, NEW.updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    item_id = EXCLUDED.item_id, plant_id = EXCLUDED.plant_id,
    storage_location_id = EXCLUDED.storage_location_id, shelf_id = EXCLUDED.shelf_id,
    quantity = EXCLUDED.quantity, reserved_quantity = EXCLUDED.reserved_quantity,
    unit = EXCLUDED.unit, location = EXCLUDED.location, notes = EXCLUDED.notes,
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END $$;

-- ─── 既存行を流し込む ───────────────────────────────────────────────────────

INSERT INTO app.item_inventory (
  id, item_id, plant_id, storage_location_id, shelf_id,
  lot_number, is_semi_finished, source_step_id,
  quantity, reserved_quantity, unit, location, notes, updated_at
)
SELECT
  pi.id, p.item_id, pi.plant_id, pi.storage_location_id, pi.shelf_id,
  pi.lot_number, pi.is_semi_finished, pi.source_step_id,
  pi.quantity, pi.reserved_quantity, i.unit, pi.location, pi.notes, pi.updated_at
FROM app.product_inventory pi
JOIN app.products p ON p.id = pi.product_id
JOIN app.items    i ON i.id = p.item_id;

INSERT INTO app.item_inventory (
  id, item_id, plant_id, storage_location_id, shelf_id,
  lot_number, is_semi_finished, source_step_id,
  quantity, reserved_quantity, unit, location, notes, updated_at
)
SELECT
  mi.id, m.item_id, mi.plant_id, mi.storage_location_id, mi.shelf_id,
  NULL, false, NULL,
  mi.quantity, mi.reserved_quantity, mi.unit, mi.location, mi.notes, mi.updated_at
FROM app.material_inventory mi
JOIN app.materials m ON m.id = mi.material_id;

-- ─── トリガーを張る ─────────────────────────────────────────────────────────

CREATE TRIGGER sync_item_inventory_after_write
  AFTER INSERT OR UPDATE ON "app"."product_inventory"
  FOR EACH ROW EXECUTE FUNCTION "app".sync_item_inventory_from_product();
CREATE TRIGGER sync_item_inventory_after_delete
  AFTER DELETE ON "app"."product_inventory"
  FOR EACH ROW EXECUTE FUNCTION "app".sync_item_inventory_from_product();

CREATE TRIGGER sync_item_inventory_after_write
  AFTER INSERT OR UPDATE ON "app"."material_inventory"
  FOR EACH ROW EXECUTE FUNCTION "app".sync_item_inventory_from_material();
CREATE TRIGGER sync_item_inventory_after_delete
  AFTER DELETE ON "app"."material_inventory"
  FOR EACH ROW EXECUTE FUNCTION "app".sync_item_inventory_from_material();

-- ─── 流し込めたことを確かめる ───────────────────────────────────────────────
-- 行数と数量の合計が合わなければ migration ごと失敗させる。
DO $$
DECLARE
  n_old int; n_new int; q_old numeric; q_new numeric;
BEGIN
  SELECT (SELECT count(*) FROM app.product_inventory)
       + (SELECT count(*) FROM app.material_inventory) INTO n_old;
  SELECT count(*) INTO n_new FROM app.item_inventory;
  IF n_old <> n_new THEN
    RAISE EXCEPTION 'item_inventory row count mismatch: old=% new=%', n_old, n_new;
  END IF;

  SELECT COALESCE((SELECT sum(quantity) FROM app.product_inventory), 0)
       + COALESCE((SELECT sum(quantity) FROM app.material_inventory), 0) INTO q_old;
  SELECT COALESCE(sum(quantity), 0) INTO q_new FROM app.item_inventory;
  IF q_old <> q_new THEN
    RAISE EXCEPTION 'item_inventory quantity mismatch: old=% new=%', q_old, q_new;
  END IF;
END $$;
