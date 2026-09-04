-- 最終検査・出荷前確認を「出荷前検査」工程へ寄せる。
--
-- これまで最終検査（work_order_final_inspections）は指示書詳細に常設のパネル
-- として出ていた。工程リストに出荷前検査が入っているかどうかに関わらず必ず
-- 出るので、その指示書で最終検査をやるのかどうかが画面から読み取れなかった。
--
-- カタログに印を 1 つ足し、印の付いた工程の実行画面だけを記入口にする。
-- 印の付いた工程を工程リストに入れなければ最終検査は無い（= 任意）。
-- 表そのもの（指示書 1 件に 1 行）は変えない — 記入口が変わるだけ。
ALTER TABLE app.process_step_catalog
  ADD COLUMN is_final_inspection boolean NOT NULL DEFAULT false;

UPDATE app.process_step_catalog
   SET is_final_inspection = true
 WHERE code = 'PRE_SHIP_INSPECTION';
