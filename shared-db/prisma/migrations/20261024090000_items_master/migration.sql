-- 品目マスタ app.items — 製品と素材の統合（第 1 段 / 全 3 段）。
--
-- この段でやるのは「鏡を作る」ことだけ。**振る舞いは 1 つも変わらない。**
-- アプリは従来どおり products / materials を読み書きし、items はトリガーで
-- 追随する。読み取り専用の統合ビューとして、在庫まわりの新しい画面が
-- 品目種別を分けずに書けるようになる、というのがこの段の成果。
--
--   第 1 段（ここ） items を作る + 流し込む + トリガーで同期
--   第 2 段         参照側 18 表に item_id を足し、アプリを移す
--   第 3 段         旧列と旧マスタを落とす
--
-- ## 同じ名前で意味が逆の列（この移行でいちばん危ないところ）
--
--   products.material_type_id / diameter_mm / length_mm
--     … その製品が**要求する**素材（材種 + 寸法）
--   materials.material_type_id / diameter_mm / length_mm
--     … その素材が**である**もの（材種 + 実寸）
--
-- 同じ列に寄せると要求寸法と実寸が混ざる。混ざっても型は通り、画面もそれらしく
-- 動いてしまうので気づけない。製品側は requires_* に分けて持つ。
--
-- ## id
--
-- items.id は製品・素材のどちらにも**新しく**採る。対応は products.item_id /
-- materials.item_id に置く。「製品は id をそのまま持ち込む」案は、あとから
-- 作られた製品が素材の使っている id を要求して衝突するので採らない
-- （products と items で別のシーケンスが id を配るため）。

-- CreateEnum
CREATE TYPE "app"."ITEM_TYPE" AS ENUM ('PRODUCT', 'MATERIAL');

-- CreateTable
CREATE TABLE "app"."items" (
    "id" SERIAL NOT NULL,
    "item_type" "app"."ITEM_TYPE" NOT NULL,
    "code" TEXT,
    "name" JSONB NOT NULL,
    "unit" TEXT NOT NULL,
    "match_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "year_month" CHAR(6),
    "seq" INTEGER,
    "legacy_key" TEXT,
    "currency" TEXT DEFAULT 'JPY',
    "tax_category_id" INTEGER,
    "spec" JSONB,
    "requires_material_type_id" INTEGER,
    "requires_diameter_mm" DECIMAL(8,3),
    "requires_length_mm" DECIMAL(10,3),
    "material_type_id" INTEGER,
    "surface_finish_code" CHAR(1),
    "diameter_code" CHAR(3),
    "length_variant_code" CHAR(3),
    "kind_code" CHAR(2),
    "diameter_mm" DECIMAL(8,3),
    "length_mm" DECIMAL(10,3),
    "manufacturer_model" TEXT,
    "nominal_diameter_mm" DECIMAL(8,3),

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- AlterTable（移行中の対応列。第 3 段で落とす）
ALTER TABLE "app"."products"  ADD COLUMN "item_id" INTEGER;
ALTER TABLE "app"."materials" ADD COLUMN "item_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "items_code_key" ON "app"."items"("code");
CREATE UNIQUE INDEX "items_legacy_key_key" ON "app"."items"("legacy_key");
CREATE UNIQUE INDEX "items_year_month_seq_key" ON "app"."items"("year_month", "seq");
CREATE INDEX "items_item_type_is_active_idx" ON "app"."items"("item_type", "is_active");
CREATE INDEX "items_material_type_id_idx" ON "app"."items"("material_type_id");
CREATE INDEX "items_requires_material_type_id_idx" ON "app"."items"("requires_material_type_id");
CREATE INDEX "items_match_names_idx" ON "app"."items" USING GIN ("match_names" array_ops);
CREATE INDEX "items_updated_at_id_idx" ON "app"."items"("updated_at", "id");
CREATE UNIQUE INDEX "products_item_id_key"  ON "app"."products"("item_id");
CREATE UNIQUE INDEX "materials_item_id_key" ON "app"."materials"("item_id");

-- AddForeignKey
ALTER TABLE "app"."items" ADD CONSTRAINT "items_tax_category_id_fkey" FOREIGN KEY ("tax_category_id") REFERENCES "app"."tax_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."items" ADD CONSTRAINT "items_requires_material_type_id_fkey" FOREIGN KEY ("requires_material_type_id") REFERENCES "app"."material_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."items" ADD CONSTRAINT "items_material_type_id_fkey" FOREIGN KEY ("material_type_id") REFERENCES "app"."material_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 同期関数 ───────────────────────────────────────────────────────────────
--
-- products / materials を書いたら items も揃える。BEFORE トリガーにしてあるのは
-- **NEW.item_id を埋めて返す**ため（AFTER では NEW への代入が効かない）。
-- 新規行の id は items 側のシーケンスから取る。

CREATE OR REPLACE FUNCTION "app".sync_item_from_product() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_code text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM app.items WHERE id = OLD.item_id;
    RETURN OLD;
  END IF;

  -- 製品コード PRD-YYYYMM-NNNN は (year_month, seq) から導出する
  -- （lib/doc-number.ts と同じ形。採番前のレガシー行は null のまま）。
  v_code := CASE
    WHEN NEW.year_month IS NOT NULL AND NEW.seq IS NOT NULL
      THEN 'PRD-' || NEW.year_month || '-' || lpad(NEW.seq::text, 4, '0')
  END;

  IF NEW.item_id IS NULL THEN
    NEW.item_id := nextval(pg_get_serial_sequence('app.items', 'id'));
  END IF;

  INSERT INTO app.items (
    id, item_type, code, name, unit, match_names, is_active, notes,
    created_at, updated_at, year_month, seq, legacy_key, currency,
    tax_category_id, spec,
    requires_material_type_id, requires_diameter_mm, requires_length_mm
  ) VALUES (
    NEW.item_id, 'PRODUCT', v_code, NEW.name, NEW.unit, NEW.match_names,
    NEW.is_active, NEW.notes, NEW.created_at, NEW.updated_at,
    NEW.year_month, NEW.seq, NEW.legacy_key, NEW.currency,
    NEW.tax_category_id, NEW.spec,
    NEW.material_type_id, NEW.diameter_mm, NEW.length_mm
  )
  ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code, name = EXCLUDED.name, unit = EXCLUDED.unit,
    match_names = EXCLUDED.match_names, is_active = EXCLUDED.is_active,
    notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at,
    year_month = EXCLUDED.year_month, seq = EXCLUDED.seq,
    legacy_key = EXCLUDED.legacy_key, currency = EXCLUDED.currency,
    tax_category_id = EXCLUDED.tax_category_id, spec = EXCLUDED.spec,
    requires_material_type_id = EXCLUDED.requires_material_type_id,
    requires_diameter_mm = EXCLUDED.requires_diameter_mm,
    requires_length_mm = EXCLUDED.requires_length_mm;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION "app".sync_item_from_material() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM app.items WHERE id = OLD.item_id;
    RETURN OLD;
  END IF;

  IF NEW.item_id IS NULL THEN
    NEW.item_id := nextval(pg_get_serial_sequence('app.items', 'id'));
  END IF;

  INSERT INTO app.items (
    id, item_type, code, name, unit, match_names, is_active, notes,
    created_at, updated_at,
    material_type_id, surface_finish_code, diameter_code, length_variant_code,
    kind_code, diameter_mm, length_mm, manufacturer_model, nominal_diameter_mm
  ) VALUES (
    NEW.item_id, 'MATERIAL', NEW.code, NEW.name, NEW.unit, NEW.match_names,
    NEW.is_active, NEW.notes, NEW.created_at, NEW.updated_at,
    NEW.material_type_id, NEW.surface_finish_code, NEW.diameter_code,
    NEW.length_variant_code, NEW.kind_code, NEW.diameter_mm, NEW.length_mm,
    NEW.manufacturer_model, NEW.nominal_diameter_mm
  )
  ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code, name = EXCLUDED.name, unit = EXCLUDED.unit,
    match_names = EXCLUDED.match_names, is_active = EXCLUDED.is_active,
    notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at,
    material_type_id = EXCLUDED.material_type_id,
    surface_finish_code = EXCLUDED.surface_finish_code,
    diameter_code = EXCLUDED.diameter_code,
    length_variant_code = EXCLUDED.length_variant_code,
    kind_code = EXCLUDED.kind_code, diameter_mm = EXCLUDED.diameter_mm,
    length_mm = EXCLUDED.length_mm,
    manufacturer_model = EXCLUDED.manufacturer_model,
    nominal_diameter_mm = EXCLUDED.nominal_diameter_mm;

  RETURN NEW;
END $$;

-- ─── 既存行を流し込む（トリガーを張る前に） ─────────────────────────────────
--
-- 1 行ずつ回す。products には「必ずある一意な業務キー」が無い（採番済みなら
-- (year_month, seq)、レガシー取込なら legacy_key、どちらも無い行もあり得る）ので、
-- まとめて INSERT してから結び直そうとすると必ずどこかで取り違える。
-- 表は数千行なので、素直に 1 行ずつ入れて id を受け取るのが確実。

DO $$
DECLARE
  r record;
  v_item_id int;
BEGIN
  FOR r IN SELECT * FROM app.products ORDER BY id LOOP
    INSERT INTO app.items (
      item_type, code, name, unit, match_names, is_active, notes,
      created_at, updated_at, year_month, seq, legacy_key, currency,
      tax_category_id, spec,
      requires_material_type_id, requires_diameter_mm, requires_length_mm
    ) VALUES (
      'PRODUCT',
      CASE WHEN r.year_month IS NOT NULL AND r.seq IS NOT NULL
           THEN 'PRD-' || r.year_month || '-' || lpad(r.seq::text, 4, '0') END,
      r.name, r.unit, r.match_names, r.is_active, r.notes,
      r.created_at, r.updated_at, r.year_month, r.seq, r.legacy_key, r.currency,
      r.tax_category_id, r.spec,
      r.material_type_id, r.diameter_mm, r.length_mm
    )
    RETURNING id INTO v_item_id;

    UPDATE app.products SET item_id = v_item_id WHERE id = r.id;
  END LOOP;

  FOR r IN SELECT * FROM app.materials ORDER BY id LOOP
    INSERT INTO app.items (
      item_type, code, name, unit, match_names, is_active, notes,
      created_at, updated_at,
      material_type_id, surface_finish_code, diameter_code, length_variant_code,
      kind_code, diameter_mm, length_mm, manufacturer_model, nominal_diameter_mm
    ) VALUES (
      'MATERIAL', r.code, r.name, r.unit, r.match_names, r.is_active, r.notes,
      r.created_at, r.updated_at,
      r.material_type_id, r.surface_finish_code, r.diameter_code,
      r.length_variant_code, r.kind_code, r.diameter_mm, r.length_mm,
      r.manufacturer_model, r.nominal_diameter_mm
    )
    RETURNING id INTO v_item_id;

    UPDATE app.materials SET item_id = v_item_id WHERE id = r.id;
  END LOOP;
END $$;

-- ─── ここからトリガーを張る ─────────────────────────────────────────────────

CREATE TRIGGER sync_item_after_write
  BEFORE INSERT OR UPDATE ON "app"."products"
  FOR EACH ROW EXECUTE FUNCTION "app".sync_item_from_product();

CREATE TRIGGER sync_item_after_delete
  AFTER DELETE ON "app"."products"
  FOR EACH ROW EXECUTE FUNCTION "app".sync_item_from_product();

CREATE TRIGGER sync_item_after_write
  BEFORE INSERT OR UPDATE ON "app"."materials"
  FOR EACH ROW EXECUTE FUNCTION "app".sync_item_from_material();

CREATE TRIGGER sync_item_after_delete
  AFTER DELETE ON "app"."materials"
  FOR EACH ROW EXECUTE FUNCTION "app".sync_item_from_material();

-- ─── 流し込めたことをここで確かめる ─────────────────────────────────────────
-- 数が合わなければ migration ごと失敗させる（黙って半端な鏡を残さない）。
DO $$
DECLARE
  p_cnt int; m_cnt int; i_p int; i_m int; unmapped int;
BEGIN
  SELECT count(*) INTO p_cnt FROM app.products;
  SELECT count(*) INTO m_cnt FROM app.materials;
  SELECT count(*) INTO i_p FROM app.items WHERE item_type = 'PRODUCT';
  SELECT count(*) INTO i_m FROM app.items WHERE item_type = 'MATERIAL';
  IF p_cnt <> i_p OR m_cnt <> i_m THEN
    RAISE EXCEPTION 'items backfill count mismatch: products %/% materials %/%',
      i_p, p_cnt, i_m, m_cnt;
  END IF;

  SELECT count(*) INTO unmapped FROM app.products WHERE item_id IS NULL;
  IF unmapped > 0 THEN
    RAISE EXCEPTION 'products.item_id unmapped: %', unmapped;
  END IF;
  SELECT count(*) INTO unmapped FROM app.materials WHERE item_id IS NULL;
  IF unmapped > 0 THEN
    RAISE EXCEPTION 'materials.item_id unmapped: %', unmapped;
  END IF;
END $$;
