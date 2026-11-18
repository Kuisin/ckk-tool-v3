-- 再研磨の値段を「品目」に寄せる 第 1 段: 型と列。
--
-- ## なぜ
--
-- 再研磨の単価はこれまで **工具の品目 × 顧客**の価格表に付けていた（注文種別
-- REGRIND のバリアント）。だが再研磨で預かる工具は他社製も含めて無数にあり、
-- 「顧客 × 工具」の行を人が作り続けないと値段が出ない。旧 FileMaker が
-- そうしていなかったのが答えで、あちらは **材料 × 加工箇所 × 刃数 × サイズ帯**
-- の 再研マスタ 1 枚で全部の値段を決めていた（外周のみ 2枚刃 φ10 以下 = 390 円）。
--
-- そこで**再研磨そのものを品目にする**（S/4HANA の役務品目と同じ考え方）。
-- 「外周研磨 超硬ヘリカルEM 2枚刃 φ0–10」が 1 品目で、値段はその品目に付く。
-- 工具が何本あっても、値段の置き場は品目の数しか増えない。
--
-- ## 値段の決まり方（2 段）
--
--   1. 品目の **標準価格**（standard_unit_price）… 顧客を問わない定価
--   2. 顧客ごとの **価格表**（price_list_entries）… あればこちらが勝つ
--
-- S/4HANA の「定価 + 顧客ごとの条件レコード」と同じ形。**この 2 段を読むのは
-- いまは再研磨の品目だけ** — 製品は従来どおり価格表が無ければ単価を解決できない
-- （見積書が「価格表からのみ作成できる」ことに依っている）。広げるのは意図して
-- やること（lib/standard-price.ts の 1 か所）。
--
-- ## 明細は品目を 2 つ指す
--
-- 再研磨の明細で**売っている**のは役務（item_id = 再研磨の品目）だが、**預かって
-- 手を入れて返す**のは顧客の工具（tool_item_id）。在庫（預り品）も指示書も工具の
-- ほうで動くので、1 列では足りない。製造の明細では tool_item_id は null。
--
-- 新しい enum 値は次の migration で使う（同じトランザクションでは使えない）。

ALTER TYPE "app"."ITEM_TYPE" ADD VALUE IF NOT EXISTS 'REGRIND';

-- ── 品目: 標準価格 + 再研磨の条件 ───────────────────────────────────────────
ALTER TABLE "app"."items"
  ADD COLUMN "standard_unit_price" DECIMAL(12,2),
  ADD COLUMN "regrind_tool_class"  TEXT,
  ADD COLUMN "regrind_location"    TEXT,
  ADD COLUMN "regrind_flutes"      INTEGER,
  ADD COLUMN "regrind_size_min_mm" DECIMAL(8,3),
  ADD COLUMN "regrind_size_max_mm" DECIMAL(8,3);

-- サイズ帯は min < 径 ≤ max。逆に入れられると「当たらない帯」が静かにできる。
ALTER TABLE "app"."items"
  ADD CONSTRAINT "items_regrind_size_band"
  CHECK ("regrind_size_min_mm" IS NULL OR "regrind_size_max_mm" IS NULL
         OR "regrind_size_min_mm" < "regrind_size_max_mm");

-- 標準価格は負にならない（0 は「無償で研ぎ直す」があり得るので通す）。
ALTER TABLE "app"."items"
  ADD CONSTRAINT "items_standard_unit_price_non_negative"
  CHECK ("standard_unit_price" IS NULL OR "standard_unit_price" >= 0);

-- ── 注文明細: 研ぎ直す工具 ──────────────────────────────────────────────────
ALTER TABLE "app"."order_lines" ADD COLUMN "tool_item_id" INTEGER;

ALTER TABLE "app"."order_lines"
  ADD CONSTRAINT "order_lines_tool_item_id_fkey"
  FOREIGN KEY ("tool_item_id") REFERENCES "app"."items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "order_lines_tool_item_id_idx" ON "app"."order_lines"("tool_item_id");

-- 再研磨品目マスタ (MS0H) の絞り込み（工具の種類 / 加工箇所）。何百と並ぶ
-- 表なので、条件で絞れないと使えない。
CREATE INDEX "items_item_type_regrind_tool_class_regrind_location_idx"
  ON "app"."items"("item_type", "regrind_tool_class", "regrind_location");
