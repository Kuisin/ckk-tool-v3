-- ============================================================================
-- 価格表を他文書と同じ複合キー (year_month, seq) に再キーする。
-- 表示番号 PRC-YYYYMM-NNNNN はキーから導出（URL id にも使用）。
-- 自然キー (customer_bp_id, product_id, order_type) は UNIQUE として維持。
-- tiers / discounts は (entry_year_month, entry_seq) で親を参照する。
-- ============================================================================

-- ── 1. entries: year_month/seq を作成月ごとに backfill ──────────────────────
ALTER TABLE "app"."price_list_entries" ADD COLUMN "year_month" CHAR(6);
ALTER TABLE "app"."price_list_entries" ADD COLUMN "seq" INTEGER;

WITH numbered AS (
  SELECT "customer_bp_id", "product_id", "order_type",
         to_char("created_at", 'YYYYMM') AS ym,
         row_number() OVER (
           PARTITION BY to_char("created_at", 'YYYYMM')
           ORDER BY "created_at", "customer_bp_id", "product_id", "order_type"
         )::int AS rn
  FROM "app"."price_list_entries"
)
UPDATE "app"."price_list_entries" e
   SET "year_month" = n.ym, "seq" = n.rn
  FROM numbered n
 WHERE e."customer_bp_id" = n."customer_bp_id"
   AND e."product_id" = n."product_id"
   AND e."order_type" = n."order_type";

ALTER TABLE "app"."price_list_entries" ALTER COLUMN "year_month" SET NOT NULL;
ALTER TABLE "app"."price_list_entries" ALTER COLUMN "seq" SET NOT NULL;

-- ── 2. tiers / discounts: 親参照を (entry_year_month, entry_seq) へ ─────────
ALTER TABLE "app"."price_list_tiers" ADD COLUMN "entry_year_month" CHAR(6);
ALTER TABLE "app"."price_list_tiers" ADD COLUMN "entry_seq" INTEGER;
UPDATE "app"."price_list_tiers" t
   SET "entry_year_month" = e."year_month", "entry_seq" = e."seq"
  FROM "app"."price_list_entries" e
 WHERE t."customer_bp_id" = e."customer_bp_id"
   AND t."product_id" = e."product_id"
   AND t."order_type" = e."order_type";
ALTER TABLE "app"."price_list_tiers" ALTER COLUMN "entry_year_month" SET NOT NULL;
ALTER TABLE "app"."price_list_tiers" ALTER COLUMN "entry_seq" SET NOT NULL;

ALTER TABLE "app"."price_list_discounts" ADD COLUMN "entry_year_month" CHAR(6);
ALTER TABLE "app"."price_list_discounts" ADD COLUMN "entry_seq" INTEGER;
UPDATE "app"."price_list_discounts" d
   SET "entry_year_month" = e."year_month", "entry_seq" = e."seq"
  FROM "app"."price_list_entries" e
 WHERE d."customer_bp_id" = e."customer_bp_id"
   AND d."product_id" = e."product_id"
   AND d."order_type" = e."order_type";
ALTER TABLE "app"."price_list_discounts" ALTER COLUMN "entry_year_month" SET NOT NULL;
ALTER TABLE "app"."price_list_discounts" ALTER COLUMN "entry_seq" SET NOT NULL;

-- ── 3. 制約の付け替え ───────────────────────────────────────────────────────
ALTER TABLE "app"."price_list_tiers" DROP CONSTRAINT "price_list_tiers_customer_bp_id_product_id_order_type_fkey";
ALTER TABLE "app"."price_list_discounts" DROP CONSTRAINT "price_list_discounts_customer_bp_id_product_id_order_type_fkey";
ALTER TABLE "app"."price_list_entries" DROP CONSTRAINT "price_list_entries_pkey";

ALTER TABLE "app"."price_list_entries" ADD CONSTRAINT "price_list_entries_pkey" PRIMARY KEY ("year_month", "seq");
CREATE UNIQUE INDEX "price_list_entries_customer_bp_id_product_id_order_type_key"
  ON "app"."price_list_entries"("customer_bp_id", "product_id", "order_type");

ALTER TABLE "app"."price_list_tiers" DROP COLUMN "customer_bp_id";
ALTER TABLE "app"."price_list_tiers" DROP COLUMN "product_id";
ALTER TABLE "app"."price_list_tiers" DROP COLUMN "order_type";
ALTER TABLE "app"."price_list_tiers" ADD CONSTRAINT "price_list_tiers_entry_year_month_entry_seq_fkey"
  FOREIGN KEY ("entry_year_month", "entry_seq")
  REFERENCES "app"."price_list_entries"("year_month", "seq") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "price_list_tiers_entry_year_month_entry_seq_min_quantity_idx"
  ON "app"."price_list_tiers"("entry_year_month", "entry_seq", "min_quantity");

ALTER TABLE "app"."price_list_discounts" DROP COLUMN "customer_bp_id";
ALTER TABLE "app"."price_list_discounts" DROP COLUMN "product_id";
ALTER TABLE "app"."price_list_discounts" DROP COLUMN "order_type";
ALTER TABLE "app"."price_list_discounts" ADD CONSTRAINT "price_list_discounts_entry_year_month_entry_seq_fkey"
  FOREIGN KEY ("entry_year_month", "entry_seq")
  REFERENCES "app"."price_list_entries"("year_month", "seq") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "price_list_discounts_entry_year_month_entry_seq_idx"
  ON "app"."price_list_discounts"("entry_year_month", "entry_seq");

-- ── 4. 採番カウンタ（PRICE_LIST / PRC）を既存分まで前進 ─────────────────────
INSERT INTO "app"."numbering_sequences" ("key", "prefix", "last_year_month", "last_sequence", "updated_at")
SELECT 'PRICE_LIST', 'PRC', mx.ym, mx.max_seq, now()
  FROM (
    SELECT "year_month" AS ym, max("seq") AS max_seq
      FROM "app"."price_list_entries"
     GROUP BY "year_month"
     ORDER BY "year_month" DESC
     LIMIT 1
  ) mx
ON CONFLICT ("key") DO UPDATE SET
  "last_year_month" = EXCLUDED."last_year_month",
  "last_sequence" = EXCLUDED."last_sequence",
  "updated_at" = now();
