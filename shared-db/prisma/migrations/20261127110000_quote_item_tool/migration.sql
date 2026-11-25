-- 見積書の明細の「研ぎ直す工具」（再研磨）。
--
-- 再研磨の価格表は任意の対象工具を持てる（20261126140000_price_list_tool_item）。
-- 価格は 顧客 × 再研磨品目 × 工具 → 顧客 × 再研磨品目（工具なし）→ 標準価格 の
-- 順で引くが、見積書の明細には工具の欄が無く、工具ごとの価格表が見積書に
-- 当たらなかった — 同じ工具の見積書と注文請書で単価が食い違っていた。
--
-- 注文明細（order_lines.tool_item_id）と同じ規約:
--   - 工具は品目（app.items の PRODUCT。他社製品でもよい）を指す
--   - **再研磨の明細だけが持つ**（CHECK quote_items_tool_only_for_regrind）
-- 再研磨の明細に工具を必須にする CHECK は置かない — 既存の再研磨の見積明細は
-- 工具を持っていない。新しい明細の必須はアプリ側（保存時の検査）が持つ。

ALTER TABLE "app"."quote_items" ADD COLUMN "tool_item_id" INTEGER;

CREATE INDEX "quote_items_tool_item_id_idx" ON "app"."quote_items"("tool_item_id");

ALTER TABLE "app"."quote_items"
  ADD CONSTRAINT "quote_items_tool_item_id_fkey"
  FOREIGN KEY ("tool_item_id") REFERENCES "app"."items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."quote_items"
  ADD CONSTRAINT "quote_items_tool_only_for_regrind"
  CHECK ("tool_item_id" IS NULL OR "order_type" = 'REGRIND'::app."ORDER_TYPE");
