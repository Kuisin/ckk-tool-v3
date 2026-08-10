-- 工具種の管理者定義化（SY02 工具種管理）
--
-- 工具種を UI から追加/削除できるようにするため、estimates.tool_type を
-- enum TRIAL_TOOL_TYPE から varchar へ変更する。工具種の定義（値・表示名）は
-- app.system_settings の trial_pricing.tool_types キーで管理し、組み込み 3 種
-- （ROUND_BAR / CYLINDER / OH）は常に存在する。既存データの値は変わらない。

ALTER TABLE "app"."estimates"
  ALTER COLUMN "tool_type" TYPE VARCHAR(64) USING "tool_type"::text;

DROP TYPE "app"."TRIAL_TOOL_TYPE";
