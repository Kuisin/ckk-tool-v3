-- 作業計画の必須項目を工程ごとに決める（§7 承認前の揃い）。
--
-- 作業場所（work_location_required）に続けて、時刻（開始・終了）と 数量 も工程ごとに
-- 要る / 要らない を選べるようにする。担当者と計画日は列が NOT NULL なので常に必須。
-- 何を入れれば「計画が揃った」かは工程マスタだけが決め、承認依頼のゲート・承認カード・
-- 計画パネルの必須印・addStepPlan がその印を読む（nextjs-web lib/work-plan-core.ts）。
-- 既定はどちらも false = これまでどおり任意。
ALTER TABLE "app"."process_step_catalog"
  ADD COLUMN "plan_time_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "plan_quantity_required" BOOLEAN NOT NULL DEFAULT false;
