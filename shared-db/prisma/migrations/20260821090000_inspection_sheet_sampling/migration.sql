-- 検査対象（抜取: 全数/割合/本数）と記録方式（実測値/合格数のみ）を項目単位から
-- シート（テンプレート）単位へ移動。記録は製品ごと（サンプル index = 製品番号）に
-- 行うため、検査する製品数と入力ビューはシートで 1 つに決まる。
-- 既存テンプレートは項目の設定を引き継いでから項目側の列を削除する。

-- AlterTable（シート側に追加）
ALTER TABLE "app"."inspection_templates" ADD COLUMN     "sampling_mode" "app"."InspectionSamplingMode" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "sampling_value" DECIMAL(10,2),
ADD COLUMN     "record_style" "app"."InspectionRecordStyle" NOT NULL DEFAULT 'VALUES';

-- 既存データ: 項目の非 ALL 抜取設定（表示順の先頭）をテンプレートへ引き継ぐ
UPDATE "app"."inspection_templates" t
SET "sampling_mode" = i."sampling_mode", "sampling_value" = i."sampling_value"
FROM (
  SELECT DISTINCT ON ("template_id") "template_id", "sampling_mode", "sampling_value"
  FROM "app"."inspection_template_items"
  WHERE "sampling_mode" <> 'ALL'
  ORDER BY "template_id", "sort_order", "id"
) i
WHERE i."template_id" = t."id";

-- 既存データ: 全項目が COUNTS のテンプレートのみ COUNTS へ（混在は VALUES）
UPDATE "app"."inspection_templates" t
SET "record_style" = 'COUNTS'
WHERE EXISTS (
  SELECT 1 FROM "app"."inspection_template_items" i WHERE i."template_id" = t."id"
)
AND NOT EXISTS (
  SELECT 1 FROM "app"."inspection_template_items" i
  WHERE i."template_id" = t."id" AND i."record_style" <> 'COUNTS'
);

-- AlterTable（項目側から削除）
ALTER TABLE "app"."inspection_template_items" DROP COLUMN "sampling_mode",
DROP COLUMN "sampling_value",
DROP COLUMN "record_style";
