-- 工程マスタの既定を新しい仕組みに合わせる（一度だけ）。
--
-- 20261013 で「作業計画に作業場所が要る」を工程ごとに切れるようにしたが、既定は
-- 全部 true のまま。在庫を動かすだけの工程（〇〇出し・受渡し）は機械もエリアも
-- 使わないので、承認のたびに架空の作業場所を選ばせることになる。組み込みの
-- 開始工程（nextjs-web lib/workflow-core.ts START_STEP_CODES）だけ false へ倒す。
-- 管理者が MS08 で後から変えられる（この UPDATE は初期値の補正）。
UPDATE "app"."process_step_catalog"
SET "work_location_required" = false
WHERE "code" IN (
  'MATERIAL_ISSUE',
  'SEMI_FINISHED_ISSUE',
  'MATERIAL_HANDOFF',
  'PRODUCT_HANDOFF',
  'PRODUCT_ISSUE'
);
