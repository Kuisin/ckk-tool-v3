-- 価格表を顧客×製品単位へ再編 + 試算↔製品リンク
--
-- 1. estimates に product_id（任意リンク。1製品に複数試算可）
-- 2. price_list_variants 新設 — 注文種別ごとの価格（基準単価・期間・試算リンク）
--    を entry から variant へ移動。tiers / discounts は variant 配下へ再ポイント
--    （tier の id は不変 → quote_items.price_list_tier_id の履歴は保持）。
-- 3. 既存データ: (customer, product) グループごとに最古の PRC 番号の entry を
--    正とし、各旧 entry 行（注文種別ごと）を variant として移設。
--    entry.is_active = グループの bool_or。非正 entry は中身移設後に削除。
-- 4. entries の自然キーを (customer_bp_id, product_id) UNIQUE へ変更。

-- 1. estimates.product_id
ALTER TABLE "app"."estimates" ADD COLUMN "product_id" INTEGER;
ALTER TABLE "app"."estimates" ADD CONSTRAINT "estimates_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "app"."products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. price_list_variants
CREATE TABLE "app"."price_list_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_year_month" CHAR(6) NOT NULL,
    "entry_seq" INTEGER NOT NULL,
    "order_type" "app"."ORDER_TYPE" NOT NULL,
    "base_unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "estimate_year_month" CHAR(6),
    "estimate_seq" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "price_list_variants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "price_list_variants_entry_year_month_entry_seq_order_type_key"
  ON "app"."price_list_variants"("entry_year_month", "entry_seq", "order_type");

ALTER TABLE "app"."price_list_variants" ADD CONSTRAINT "price_list_variants_entry_year_month_entry_seq_fkey"
  FOREIGN KEY ("entry_year_month", "entry_seq")
  REFERENCES "app"."price_list_entries"("year_month", "seq")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."price_list_variants" ADD CONSTRAINT "price_list_variants_estimate_year_month_estimate_seq_fkey"
  FOREIGN KEY ("estimate_year_month", "estimate_seq")
  REFERENCES "app"."estimates"("year_month", "seq")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. 既存データ移設
-- 正 entry = (customer, product) ごとに最古の (year_month, seq)
CREATE TEMP TABLE "canon" AS
SELECT DISTINCT ON ("customer_bp_id", "product_id")
       "customer_bp_id", "product_id", "year_month", "seq"
FROM "app"."price_list_entries"
ORDER BY "customer_bp_id", "product_id", "year_month", "seq";

-- 旧 entry 行 → 正 entry 配下の variant への対応表
CREATE TEMP TABLE "variant_map" AS
SELECT e."year_month" AS "old_ym", e."seq" AS "old_seq",
       c."year_month" AS "canon_ym", c."seq" AS "canon_seq",
       gen_random_uuid() AS "variant_id"
FROM "app"."price_list_entries" e
JOIN "canon" c USING ("customer_bp_id", "product_id");

INSERT INTO "app"."price_list_variants"
  ("id", "entry_year_month", "entry_seq", "order_type", "base_unit_price",
   "valid_from", "valid_until", "estimate_year_month", "estimate_seq",
   "is_active", "created_at", "updated_at")
SELECT m."variant_id", m."canon_ym", m."canon_seq", e."order_type", e."base_unit_price",
       e."valid_from", e."valid_until", e."estimate_year_month", e."estimate_seq",
       e."is_active", e."created_at", e."updated_at"
FROM "app"."price_list_entries" e
JOIN "variant_map" m ON m."old_ym" = e."year_month" AND m."old_seq" = e."seq";

-- tiers: entry キー → variant_id（tier の id は不変）
ALTER TABLE "app"."price_list_tiers" ADD COLUMN "variant_id" UUID;
UPDATE "app"."price_list_tiers" t SET "variant_id" = m."variant_id"
FROM "variant_map" m
WHERE m."old_ym" = t."entry_year_month" AND m."old_seq" = t."entry_seq";
ALTER TABLE "app"."price_list_tiers" ALTER COLUMN "variant_id" SET NOT NULL;
ALTER TABLE "app"."price_list_tiers" DROP CONSTRAINT "price_list_tiers_entry_year_month_entry_seq_fkey";
DROP INDEX "app"."price_list_tiers_entry_year_month_entry_seq_min_quantity_idx";
ALTER TABLE "app"."price_list_tiers" DROP COLUMN "entry_year_month";
ALTER TABLE "app"."price_list_tiers" DROP COLUMN "entry_seq";
ALTER TABLE "app"."price_list_tiers" ADD CONSTRAINT "price_list_tiers_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "app"."price_list_variants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "price_list_tiers_variant_id_min_quantity_idx"
  ON "app"."price_list_tiers"("variant_id", "min_quantity");

-- discounts: 同様
ALTER TABLE "app"."price_list_discounts" ADD COLUMN "variant_id" UUID;
UPDATE "app"."price_list_discounts" d SET "variant_id" = m."variant_id"
FROM "variant_map" m
WHERE m."old_ym" = d."entry_year_month" AND m."old_seq" = d."entry_seq";
ALTER TABLE "app"."price_list_discounts" ALTER COLUMN "variant_id" SET NOT NULL;
ALTER TABLE "app"."price_list_discounts" DROP CONSTRAINT "price_list_discounts_entry_year_month_entry_seq_fkey";
DROP INDEX "app"."price_list_discounts_entry_year_month_entry_seq_idx";
ALTER TABLE "app"."price_list_discounts" DROP COLUMN "entry_year_month";
ALTER TABLE "app"."price_list_discounts" DROP COLUMN "entry_seq";
ALTER TABLE "app"."price_list_discounts" ADD CONSTRAINT "price_list_discounts_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "app"."price_list_variants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "price_list_discounts_variant_id_idx"
  ON "app"."price_list_discounts"("variant_id");

-- estimates.product_id の補完 — 旧 entry リンクから一意に決まる場合のみ
UPDATE "app"."estimates" est SET "product_id" = s."pid"
FROM (SELECT "estimate_year_month", "estimate_seq", min("product_id") AS "pid"
      FROM "app"."price_list_entries"
      WHERE "estimate_year_month" IS NOT NULL
      GROUP BY 1, 2
      HAVING count(DISTINCT "product_id") = 1) s
WHERE est."year_month" = s."estimate_year_month" AND est."seq" = s."estimate_seq";

-- entry.is_active = グループの bool_or → 非正 entry を削除
UPDATE "app"."price_list_entries" e SET "is_active" = g."any_active"
FROM (SELECT "customer_bp_id", "product_id", bool_or("is_active") AS "any_active"
      FROM "app"."price_list_entries" GROUP BY 1, 2) g
WHERE e."customer_bp_id" = g."customer_bp_id" AND e."product_id" = g."product_id";

DELETE FROM "app"."price_list_entries" e
WHERE NOT EXISTS (SELECT 1 FROM "canon" c
                  WHERE c."year_month" = e."year_month" AND c."seq" = e."seq");

-- 4. entries 再整形: 移設済みカラムと旧キーを撤去、(customer, product) UNIQUE
DROP INDEX "app"."price_list_entries_customer_bp_id_product_id_order_type_key";
ALTER TABLE "app"."price_list_entries" DROP CONSTRAINT "price_list_entries_estimate_year_month_estimate_seq_fkey";
ALTER TABLE "app"."price_list_entries" DROP COLUMN "order_type";
ALTER TABLE "app"."price_list_entries" DROP COLUMN "base_unit_price";
ALTER TABLE "app"."price_list_entries" DROP COLUMN "valid_from";
ALTER TABLE "app"."price_list_entries" DROP COLUMN "valid_until";
ALTER TABLE "app"."price_list_entries" DROP COLUMN "estimate_year_month";
ALTER TABLE "app"."price_list_entries" DROP COLUMN "estimate_seq";
CREATE UNIQUE INDEX "price_list_entries_customer_bp_id_product_id_key"
  ON "app"."price_list_entries"("customer_bp_id", "product_id");

DROP TABLE "variant_map";
DROP TABLE "canon";
