-- 仕掛ブランクは 材種 × 径 × 長 で 1 行（20261126170000_wip_state_core の続き）。
--
-- 別ファイルなのは、'BLANK' を ADD VALUE したのと同じトランザクションでは
-- その値を使えないため（Prisma は 1 ファイル = 1 トランザクション）。
-- 部分 index は Prisma スキーマで表せないので、ここにだけある
-- （tax_categories_is_default_idx と同じ扱い）。
CREATE UNIQUE INDEX "items_blank_dimensions_key"
  ON "app"."items" ("material_type_id", "diameter_mm", "length_mm")
  WHERE "item_type" = 'BLANK';
