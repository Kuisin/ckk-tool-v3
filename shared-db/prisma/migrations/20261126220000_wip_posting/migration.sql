-- 仕掛品の再設計 第 3 段（PR 3/7）: 計上を加工状態ごとに切り替えるための列。
--
-- 第 2 段までは指示書の完了で半製品を 1 本のバケットにまとめて入れていた。
-- この段からアプリは**発生元の工程ごと**に、仕掛ブランク × 加工状態 × 目標製品 ×
-- 仕上がり寸法 のバケットへ入れる（lib/inventory.ts onWorkOrderCompletedTx）。
-- そのために、品物が工程を離れて在庫に入るときに記録する値を工程に持たせる:
--
--   finished_diameter_mm / finished_length_mm
--     研削後の仕上がり寸法。半製品の数を記録した工程・「半製品在庫へ」で終わる
--     分岐の終端でだけ入る（利用者の決定 2026-11-25 — 在庫に置くときだけ必須）。
--   wip_path_step_ids
--     手前に合流があって加工状態が一通りに決まらないとき、記録した人が選んだ
--     並び（工程カタログ id の JSON 配列。この工程自身は含めない形）。
--     NULL = 推奨（本流を辿った並び）のまま。空の配列 [] は「形を変える工程は
--     まだ 1 つも済んでいない」という選択で、NULL とは意味が違う — だから
--     NOT NULL DEFAULT '{}' の配列列にはしていない。
--
-- ローリングデプロイ: 列を足すだけ（すべて NULL 可・既定なし）。旧アプリは
-- 知らないので触らない。旧アプリが完了させた指示書は、旧来の形のまま INSERT
-- してくるので第 2 段のトリガー（item_inventory_wip_legacy）が従来どおり受ける。
-- 関数・トリガー・既存の制約には触らない。

ALTER TABLE "app"."work_order_steps"
  ADD COLUMN "finished_diameter_mm" DECIMAL(8,3),
  ADD COLUMN "finished_length_mm" DECIMAL(10,3),
  ADD COLUMN "wip_path_step_ids" JSONB;

ALTER TABLE "app"."work_order_steps"
  ADD CONSTRAINT "work_order_steps_finished_dims_positive"
  CHECK (("finished_diameter_mm" IS NULL OR "finished_diameter_mm" > 0)
     AND ("finished_length_mm" IS NULL OR "finished_length_mm" > 0));

ALTER TABLE "app"."work_order_steps"
  ADD CONSTRAINT "work_order_steps_wip_path_is_array"
  CHECK ("wip_path_step_ids" IS NULL OR jsonb_typeof("wip_path_step_ids") = 'array');
