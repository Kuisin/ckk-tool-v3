-- 再研磨の値段を「品目」に寄せる 第 2 段: 新しい enum 値を使う分。
--
-- 前の migration で足した 'REGRIND'（ITEM_TYPE）はコミットまで使えないので、
-- それを名指しする CHECK はここに分けてある。

-- 再研磨の条件・標準価格を持てるのは再研磨の品目だけ。製品に紛れ込むと、
-- 「なぜかこの製品にだけ定価がある」状態が静かにできて、価格表を読まない
-- 経路が生まれる。
ALTER TABLE "app"."items"
  ADD CONSTRAINT "items_regrind_columns_only_for_regrind"
  CHECK (
    "item_type" = 'REGRIND'
    OR ("regrind_tool_class" IS NULL AND "regrind_location" IS NULL
        AND "regrind_flutes" IS NULL AND "regrind_size_min_mm" IS NULL
        AND "regrind_size_max_mm" IS NULL AND "standard_unit_price" IS NULL)
  );

-- 確定した再研磨の明細は、研ぎ直す工具を必ず名指ししていること。
-- 下書きのうちは null でよい（品目の突合と同じで、確定のときに揃う）。
-- **工具を持たない再研磨の明細は指示書にできない** — 預り品をどの品目で
-- 数えるか決まらないため。
ALTER TABLE "app"."order_lines"
  ADD CONSTRAINT "order_lines_regrind_tool"
  CHECK (
    "status" = 'DRAFT'::app."ORDER_LINE_STATUS"
    OR "order_type" <> 'REGRIND'::app."ORDER_TYPE"
    OR "tool_item_id" IS NOT NULL
  );

-- 逆に、再研磨でない明細は工具を持たない（売り物そのものが item_id なので）。
ALTER TABLE "app"."order_lines"
  ADD CONSTRAINT "order_lines_tool_only_for_regrind"
  CHECK ("tool_item_id" IS NULL OR "order_type" = 'REGRIND'::app."ORDER_TYPE");
