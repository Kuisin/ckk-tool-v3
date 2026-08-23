-- 工程カタログに 製品出し（在庫） PRODUCT_ISSUE を追加する（§7 / 指示書ビルダー再編）。
--
-- 在庫分（FROM_STOCK）の指示書は「製品出し（在庫）」で始まり、任意で
-- 出荷前検査 → 出荷 を付けるだけの固定構成になる。製造分（MANUFACTURE）の
-- 工程選択には出さない（アプリ側 workflow-core が code で制御）。
--
-- スキーマ変更なし — マスタ行の追加のみ（code で冪等）。

INSERT INTO "app"."process_step_catalog"
  ("code", "name", "category", "execution_location", "is_sync_capable",
   "is_inspection", "is_approval_step", "approval_min_rank", "sort_order", "notes")
SELECT
  'PRODUCT_ISSUE',
  '{"ja":"製品出し（在庫）","en":"Product issue (stock)"}',
  'MATERIAL_PREP', 'INTERNAL', false, false, false, NULL, 25,
  '在庫の移動（在庫分指示書の開始工程 — 製造分の工程選択には出さない）'
WHERE NOT EXISTS (
  SELECT 1 FROM "app"."process_step_catalog" WHERE "code" = 'PRODUCT_ISSUE'
);
