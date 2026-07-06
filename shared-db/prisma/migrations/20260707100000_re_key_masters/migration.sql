-- ============================================================================
-- Re-key masters: 内部 id(連番) と表示コードを分離する。
--   material_types: id SERIAL + code(材種コード, 変換済のみ) + legacy_key(uuid5)
--   materials:      id SERIAL + code(素材コード)
--   products:       id SERIAL + (year_month, seq) 複合 unique（PRD- コードは導出）
--                   + legacy_key(uuid5, レガシー取込の冪等キー)
-- 既存データを保持したまま FK（materials.material_type_id, products.material_id,
-- estimates.material_id, 発注明細/入荷, 価格表複合 PK, 見積明細）を int に張替える。
-- ============================================================================

-- ── 1. material_types: id → serial, 旧 id を code / legacy_key へ ───────────
ALTER TABLE "app"."material_types" ADD COLUMN "id_new" SERIAL;
ALTER TABLE "app"."material_types" ADD COLUMN "code" TEXT;
ALTER TABLE "app"."material_types" ADD COLUMN "legacy_key" TEXT;
UPDATE "app"."material_types" SET "code" = "id" WHERE "id" ~ '^[A-Z][0-9]{2}[A-Z][0-9]{4}$';
UPDATE "app"."material_types" SET "legacy_key" = "id" WHERE "code" IS NULL;

ALTER TABLE "app"."materials" ADD COLUMN "material_type_id_new" INTEGER;
UPDATE "app"."materials" m SET "material_type_id_new" = t."id_new"
  FROM "app"."material_types" t WHERE m."material_type_id" = t."id";
ALTER TABLE "app"."materials" ALTER COLUMN "material_type_id_new" SET NOT NULL;

ALTER TABLE "app"."materials" DROP CONSTRAINT "materials_material_type_id_fkey";
ALTER TABLE "app"."material_types" DROP CONSTRAINT "material_types_pkey";
ALTER TABLE "app"."material_types" DROP COLUMN "id";
ALTER TABLE "app"."material_types" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "app"."material_types" ADD CONSTRAINT "material_types_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "material_types_code_key" ON "app"."material_types"("code");
CREATE UNIQUE INDEX "material_types_legacy_key_key" ON "app"."material_types"("legacy_key");

ALTER TABLE "app"."materials" DROP COLUMN "material_type_id"; -- 複合 unique も一緒に消える（後で再作成）
ALTER TABLE "app"."materials" RENAME COLUMN "material_type_id_new" TO "material_type_id";

-- ── 2. materials: id → serial, 旧 id を code へ ─────────────────────────────
ALTER TABLE "app"."materials" ADD COLUMN "id_new" SERIAL;

ALTER TABLE "app"."products" ADD COLUMN "material_id_new" INTEGER;
UPDATE "app"."products" p SET "material_id_new" = m."id_new"
  FROM "app"."materials" m WHERE p."material_id" = m."id";
ALTER TABLE "app"."products" DROP CONSTRAINT "products_material_id_fkey";
ALTER TABLE "app"."products" DROP COLUMN "material_id";
ALTER TABLE "app"."products" RENAME COLUMN "material_id_new" TO "material_id";

ALTER TABLE "app"."estimates" ADD COLUMN "material_id_new" INTEGER;
UPDATE "app"."estimates" e SET "material_id_new" = m."id_new"
  FROM "app"."materials" m WHERE e."material_id" = m."id";
ALTER TABLE "app"."estimates" DROP CONSTRAINT "estimates_material_id_fkey";
ALTER TABLE "app"."estimates" DROP COLUMN "material_id";
ALTER TABLE "app"."estimates" RENAME COLUMN "material_id_new" TO "material_id";

ALTER TABLE "app"."material_purchase_order_items" ADD COLUMN "material_id_new" INTEGER;
UPDATE "app"."material_purchase_order_items" i SET "material_id_new" = m."id_new"
  FROM "app"."materials" m WHERE i."material_id" = m."id";
ALTER TABLE "app"."material_purchase_order_items" ALTER COLUMN "material_id_new" SET NOT NULL;
ALTER TABLE "app"."material_purchase_order_items" DROP CONSTRAINT "material_purchase_order_items_material_id_fkey";
ALTER TABLE "app"."material_purchase_order_items" DROP COLUMN "material_id";
ALTER TABLE "app"."material_purchase_order_items" RENAME COLUMN "material_id_new" TO "material_id";

ALTER TABLE "app"."material_receipts" ADD COLUMN "material_id_new" INTEGER;
UPDATE "app"."material_receipts" r SET "material_id_new" = m."id_new"
  FROM "app"."materials" m WHERE r."material_id" = m."id";
ALTER TABLE "app"."material_receipts" ALTER COLUMN "material_id_new" SET NOT NULL;
ALTER TABLE "app"."material_receipts" DROP CONSTRAINT "material_receipts_material_id_fkey";
ALTER TABLE "app"."material_receipts" DROP COLUMN "material_id";
ALTER TABLE "app"."material_receipts" RENAME COLUMN "material_id_new" TO "material_id";

ALTER TABLE "app"."materials" DROP CONSTRAINT "materials_pkey";
ALTER TABLE "app"."materials" RENAME COLUMN "id" TO "code";
ALTER TABLE "app"."materials" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "app"."materials" ADD CONSTRAINT "materials_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "materials_code_key" ON "app"."materials"("code");
CREATE UNIQUE INDEX "materials_material_type_id_surface_finish_code_diameter_cod_key"
  ON "app"."materials"("material_type_id", "surface_finish_code", "diameter_code", "length_variant_code");

ALTER TABLE "app"."materials" ADD CONSTRAINT "materials_material_type_id_fkey"
  FOREIGN KEY ("material_type_id") REFERENCES "app"."material_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."products" ADD CONSTRAINT "products_material_id_fkey"
  FOREIGN KEY ("material_id") REFERENCES "app"."materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."estimates" ADD CONSTRAINT "estimates_material_id_fkey"
  FOREIGN KEY ("material_id") REFERENCES "app"."materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."material_purchase_order_items" ADD CONSTRAINT "material_purchase_order_items_material_id_fkey"
  FOREIGN KEY ("material_id") REFERENCES "app"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."material_receipts" ADD CONSTRAINT "material_receipts_material_id_fkey"
  FOREIGN KEY ("material_id") REFERENCES "app"."materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "material_purchase_order_items_material_id_idx" ON "app"."material_purchase_order_items"("material_id");
CREATE INDEX "material_receipts_material_id_received_at_idx" ON "app"."material_receipts"("material_id", "received_at");

-- ── 3. products: id → serial, PRD- コードは (year_month, seq) へ分解 ────────
ALTER TABLE "app"."products" ADD COLUMN "id_new" SERIAL;
ALTER TABLE "app"."products" ADD COLUMN "year_month" CHAR(6);
ALTER TABLE "app"."products" ADD COLUMN "seq" INTEGER;
ALTER TABLE "app"."products" ADD COLUMN "legacy_key" TEXT;
UPDATE "app"."products"
   SET "year_month" = substring("id" from 5 for 6), "seq" = substring("id" from 12)::int
 WHERE "id" ~ '^PRD-[0-9]{6}-[0-9]+$';
UPDATE "app"."products" SET "legacy_key" = "id" WHERE "year_month" IS NULL;

ALTER TABLE "app"."price_list_entries" ADD COLUMN "product_id_new" INTEGER;
UPDATE "app"."price_list_entries" e SET "product_id_new" = p."id_new"
  FROM "app"."products" p WHERE e."product_id" = p."id";
ALTER TABLE "app"."price_list_entries" ALTER COLUMN "product_id_new" SET NOT NULL;
ALTER TABLE "app"."price_list_tiers" ADD COLUMN "product_id_new" INTEGER;
UPDATE "app"."price_list_tiers" t SET "product_id_new" = p."id_new"
  FROM "app"."products" p WHERE t."product_id" = p."id";
ALTER TABLE "app"."price_list_tiers" ALTER COLUMN "product_id_new" SET NOT NULL;
ALTER TABLE "app"."price_list_discounts" ADD COLUMN "product_id_new" INTEGER;
UPDATE "app"."price_list_discounts" d SET "product_id_new" = p."id_new"
  FROM "app"."products" p WHERE d."product_id" = p."id";
ALTER TABLE "app"."price_list_discounts" ALTER COLUMN "product_id_new" SET NOT NULL;
ALTER TABLE "app"."quote_items" ADD COLUMN "product_id_new" INTEGER;
UPDATE "app"."quote_items" q SET "product_id_new" = p."id_new"
  FROM "app"."products" p WHERE q."product_id" = p."id";
ALTER TABLE "app"."quote_items" ALTER COLUMN "product_id_new" SET NOT NULL;

ALTER TABLE "app"."price_list_tiers" DROP CONSTRAINT "price_list_tiers_customer_bp_id_product_id_order_type_fkey";
ALTER TABLE "app"."price_list_discounts" DROP CONSTRAINT "price_list_discounts_customer_bp_id_product_id_order_type_fkey";
ALTER TABLE "app"."quote_items" DROP CONSTRAINT "quote_items_product_id_fkey";
ALTER TABLE "app"."price_list_entries" DROP CONSTRAINT "price_list_entries_product_id_fkey";
ALTER TABLE "app"."price_list_entries" DROP CONSTRAINT "price_list_entries_pkey";
ALTER TABLE "app"."products" DROP CONSTRAINT "products_pkey";

ALTER TABLE "app"."products" DROP COLUMN "id";
ALTER TABLE "app"."products" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "app"."products" ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "products_year_month_seq_key" ON "app"."products"("year_month", "seq");
CREATE UNIQUE INDEX "products_legacy_key_key" ON "app"."products"("legacy_key");

ALTER TABLE "app"."price_list_entries" DROP COLUMN "product_id";
ALTER TABLE "app"."price_list_entries" RENAME COLUMN "product_id_new" TO "product_id";
ALTER TABLE "app"."price_list_entries" ADD CONSTRAINT "price_list_entries_pkey"
  PRIMARY KEY ("customer_bp_id", "product_id", "order_type");
ALTER TABLE "app"."price_list_entries" ADD CONSTRAINT "price_list_entries_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."price_list_tiers" DROP COLUMN "product_id"; -- 複合 idx も一緒に消える
ALTER TABLE "app"."price_list_tiers" RENAME COLUMN "product_id_new" TO "product_id";
ALTER TABLE "app"."price_list_tiers" ADD CONSTRAINT "price_list_tiers_customer_bp_id_product_id_order_type_fkey"
  FOREIGN KEY ("customer_bp_id", "product_id", "order_type")
  REFERENCES "app"."price_list_entries"("customer_bp_id", "product_id", "order_type") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "price_list_tiers_customer_bp_id_product_id_order_type_min_q_idx"
  ON "app"."price_list_tiers"("customer_bp_id", "product_id", "order_type", "min_quantity");

ALTER TABLE "app"."price_list_discounts" DROP COLUMN "product_id";
ALTER TABLE "app"."price_list_discounts" RENAME COLUMN "product_id_new" TO "product_id";
ALTER TABLE "app"."price_list_discounts" ADD CONSTRAINT "price_list_discounts_customer_bp_id_product_id_order_type_fkey"
  FOREIGN KEY ("customer_bp_id", "product_id", "order_type")
  REFERENCES "app"."price_list_entries"("customer_bp_id", "product_id", "order_type") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "price_list_discounts_customer_bp_id_product_id_order_type_idx"
  ON "app"."price_list_discounts"("customer_bp_id", "product_id", "order_type");

ALTER TABLE "app"."quote_items" DROP COLUMN "product_id";
ALTER TABLE "app"."quote_items" RENAME COLUMN "product_id_new" TO "product_id";
ALTER TABLE "app"."quote_items" ADD CONSTRAINT "quote_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
