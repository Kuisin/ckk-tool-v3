-- 価格表の対象工具（再研磨）。
--
-- 再研磨の値段は顧客ごとに、**どの工具を研ぐか**でも変わることがある。
-- 価格表のエントリに任意の対象工具を持たせ、解決は
--   顧客 × 役務 × 工具 → 顧客 × 役務（工具なし）→ 標準価格
-- の順で引く（components/sales/quotes/model.ts selectPriceEntry）。
--
-- 識別は (顧客, 品目) から (顧客, 品目, 工具) へ広がる。工具なしの価格表は
-- 従来どおり顧客 × 品目に 1 つだけ — NULL を 1 つの値として数えるため、
-- unique index を「工具なし」「工具あり」の 2 本の部分 index に割る。
-- Prisma は部分 unique を表現できないので schema には書かない
-- （前例: tax_categories_is_default_idx）。既存の行は全部 tool_item_id = NULL
-- なので、置き換えの前後で一意性の意味は変わらない。

ALTER TABLE "app"."price_list_entries" ADD COLUMN "tool_item_id" INTEGER;

CREATE INDEX "price_list_entries_tool_item_id_idx"
  ON "app"."price_list_entries"("tool_item_id");

ALTER TABLE "app"."price_list_entries"
  ADD CONSTRAINT "price_list_entries_tool_item_id_fkey"
  FOREIGN KEY ("tool_item_id") REFERENCES "app"."items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "app"."price_list_entries_customer_bp_id_item_id_key";

CREATE UNIQUE INDEX "price_list_entries_customer_item_no_tool_key"
  ON "app"."price_list_entries"("customer_bp_id", "item_id")
  WHERE "tool_item_id" IS NULL;

CREATE UNIQUE INDEX "price_list_entries_customer_item_tool_key"
  ON "app"."price_list_entries"("customer_bp_id", "item_id", "tool_item_id")
  WHERE "tool_item_id" IS NOT NULL;
