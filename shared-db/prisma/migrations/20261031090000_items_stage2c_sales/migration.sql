-- 品目統合 第 2 段 C — 販売書類の製品参照を品目へ付け替える。
--
-- **この段はいちばん影響が大きい。** 金額・PDF・弥生 CSV・価格表の解決まで
-- 連なるので、手順が枯れた最後に回してある（B 購買 → D 生産設計 → C 販売）。
--
--   estimates.product_id             価格試算
--   price_list_entries.product_id    価格表（顧客 × 製品の自然キー）
--   quote_items.product_id           見積明細
--   order_lines.product_id           注文明細（突合前は null）
--   delivery_order_items.product_id  出荷明細
--   delivery_note_items.product_id   納品明細
--   customer_product_codes.product_id 顧客品番
--
-- 旧列 product_id は残す。price_list_entries の自然キー
-- (customer_bp_id, product_id) も**この段では触らない** — 価格表の識別は
-- 作成後不変という約束があり、鍵を差し替えるのは別の判断。

-- AlterTable
ALTER TABLE "app"."estimates"              ADD COLUMN "item_id" INTEGER;
ALTER TABLE "app"."price_list_entries"     ADD COLUMN "item_id" INTEGER;
ALTER TABLE "app"."quote_items"            ADD COLUMN "item_id" INTEGER;
ALTER TABLE "app"."order_lines"            ADD COLUMN "item_id" INTEGER;
ALTER TABLE "app"."delivery_order_items"   ADD COLUMN "item_id" INTEGER;
ALTER TABLE "app"."delivery_note_items"    ADD COLUMN "item_id" INTEGER;
ALTER TABLE "app"."customer_product_codes" ADD COLUMN "item_id" INTEGER;

-- 既存行を埋める（製品 → 品目）
UPDATE "app"."estimates" t              SET item_id = p.item_id FROM "app"."products" p WHERE p.id = t.product_id;
UPDATE "app"."price_list_entries" t     SET item_id = p.item_id FROM "app"."products" p WHERE p.id = t.product_id;
UPDATE "app"."quote_items" t            SET item_id = p.item_id FROM "app"."products" p WHERE p.id = t.product_id;
UPDATE "app"."order_lines" t            SET item_id = p.item_id FROM "app"."products" p WHERE p.id = t.product_id;
UPDATE "app"."delivery_order_items" t   SET item_id = p.item_id FROM "app"."products" p WHERE p.id = t.product_id;
UPDATE "app"."delivery_note_items" t    SET item_id = p.item_id FROM "app"."products" p WHERE p.id = t.product_id;
UPDATE "app"."customer_product_codes" t SET item_id = p.item_id FROM "app"."products" p WHERE p.id = t.product_id;

-- CreateIndex
CREATE INDEX "estimates_item_id_idx"              ON "app"."estimates"("item_id");
CREATE INDEX "price_list_entries_item_id_idx"     ON "app"."price_list_entries"("item_id");
CREATE INDEX "quote_items_item_id_idx"            ON "app"."quote_items"("item_id");
CREATE INDEX "order_lines_item_id_idx"            ON "app"."order_lines"("item_id");
CREATE INDEX "delivery_order_items_item_id_idx"   ON "app"."delivery_order_items"("item_id");
CREATE INDEX "delivery_note_items_item_id_idx"    ON "app"."delivery_note_items"("item_id");
CREATE INDEX "customer_product_codes_item_id_idx" ON "app"."customer_product_codes"("item_id");

-- AddForeignKey
ALTER TABLE "app"."estimates"              ADD CONSTRAINT "estimates_item_id_fkey"              FOREIGN KEY ("item_id") REFERENCES "app"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."price_list_entries"     ADD CONSTRAINT "price_list_entries_item_id_fkey"     FOREIGN KEY ("item_id") REFERENCES "app"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."quote_items"            ADD CONSTRAINT "quote_items_item_id_fkey"            FOREIGN KEY ("item_id") REFERENCES "app"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."order_lines"            ADD CONSTRAINT "order_lines_item_id_fkey"            FOREIGN KEY ("item_id") REFERENCES "app"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."delivery_order_items"   ADD CONSTRAINT "delivery_order_items_item_id_fkey"   FOREIGN KEY ("item_id") REFERENCES "app"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."delivery_note_items"    ADD CONSTRAINT "delivery_note_items_item_id_fkey"    FOREIGN KEY ("item_id") REFERENCES "app"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."customer_product_codes" ADD CONSTRAINT "customer_product_codes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "app"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 埋め残しがあれば止める
DO $$
DECLARE n int;
BEGIN
  SELECT
    (SELECT count(*) FROM app.estimates              WHERE product_id IS NOT NULL AND item_id IS NULL)
  + (SELECT count(*) FROM app.price_list_entries     WHERE product_id IS NOT NULL AND item_id IS NULL)
  + (SELECT count(*) FROM app.quote_items            WHERE product_id IS NOT NULL AND item_id IS NULL)
  + (SELECT count(*) FROM app.order_lines            WHERE product_id IS NOT NULL AND item_id IS NULL)
  + (SELECT count(*) FROM app.delivery_order_items   WHERE product_id IS NOT NULL AND item_id IS NULL)
  + (SELECT count(*) FROM app.delivery_note_items    WHERE product_id IS NOT NULL AND item_id IS NULL)
  + (SELECT count(*) FROM app.customer_product_codes WHERE product_id IS NOT NULL AND item_id IS NULL)
  INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'stage2c: product_id はあるのに item_id が埋まらなかった行が % 件', n;
  END IF;
END $$;
