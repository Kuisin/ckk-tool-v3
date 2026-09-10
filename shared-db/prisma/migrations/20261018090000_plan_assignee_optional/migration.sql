-- 作業計画の担当者を任意にする（既定）。
--
-- これまで work_order_step_plans.user_id は NOT NULL で、計画の最小単位が
-- 「誰が・いつ・どこで」だった。承認前に人まで決められない工程が多く、承認を
-- 出すためだけに仮の担当者を入れる運用になっていたため、最小単位を
-- 「いつ・どこで」に戻し、担当者は工程マスタの印で工程ごとに要求する
-- （process_step_catalog.plan_assignee_required、既定 false）。
-- 判定は lib/work-plan-core.ts requiredPlanFields が唯一の定義。
--
-- NOT NULL を外すだけ（既存行は全て担当者付きのまま）。FK の RESTRICT は変えない。

ALTER TABLE app.process_step_catalog
  ADD COLUMN plan_assignee_required boolean NOT NULL DEFAULT false;

ALTER TABLE app.work_order_step_plans
  ALTER COLUMN user_id DROP NOT NULL;
