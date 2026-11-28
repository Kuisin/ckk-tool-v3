-- 工程マスタの「計画の数量を必須にする」印を落とす。
--
-- 2026-09-17 に作業計画の数量そのものを廃止し、この印はどこからも読まれなく
-- なった（工程マスタの画面・承認依頼の揃い判定 requiredPlanFields のどちらにも
-- 無い）。ローリングデプロイ中の旧コンテナが書き続けるため列だけ残し、スキーマに
-- @deprecated で「移行が終わったら別マイグレーションで落とす」と書いていた。
-- それから 2 か月、dev / main とも現行のアプリはこの列を読み書きしない。
--
-- allow-destructive: 2026-09-17 以降のアプリはこの列を読み書きしない（スキーマで @deprecated、画面・判定とも未使用）
ALTER TABLE "app"."process_step_catalog" DROP COLUMN IF EXISTS "plan_quantity_required";
