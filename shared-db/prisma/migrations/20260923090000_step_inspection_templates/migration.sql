-- 検査表テンプレートの紐付けを 指示書単位 → 検査工程ステップ単位 へ移行する。
--
--   旧: work_order_inspection_templates (work_order_id, inspection_template_id)
--   新: work_order_step_inspection_templates (work_order_step_id, inspection_template_id)
--
-- 検査工程が複数ある指示書で「どの検査表がどの工程のものか」が曖昧だったため、
-- 割当そのものを工程ステップに持たせる。既存データは実行時のフィルタ規則
-- （検査工程 かつ 関連工程が一致 or 未設定）と同じ条件で各検査工程へ複写する —
-- どの検査工程にも合わなかった旧行は、そもそも実行画面に出ていなかったので捨てる。

-- 1. 新テーブル
CREATE TABLE "app"."work_order_step_inspection_templates" (
    "work_order_step_id" UUID NOT NULL,
    "inspection_template_id" INTEGER NOT NULL,

    CONSTRAINT "work_order_step_inspection_templates_pkey" PRIMARY KEY ("work_order_step_id","inspection_template_id")
);

ALTER TABLE "app"."work_order_step_inspection_templates"
  ADD CONSTRAINT "work_order_step_inspection_templates_work_order_step_id_fkey"
  FOREIGN KEY ("work_order_step_id") REFERENCES "app"."work_order_steps"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."work_order_step_inspection_templates"
  ADD CONSTRAINT "work_order_step_inspection_templates_inspection_template_i_fkey"
  FOREIGN KEY ("inspection_template_id") REFERENCES "app"."inspection_templates"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. 既存データの複写（実行画面に出ていた組だけ）
INSERT INTO "app"."work_order_step_inspection_templates"
  ("work_order_step_id", "inspection_template_id")
SELECT s."id", l."inspection_template_id"
FROM "app"."work_order_inspection_templates" l
JOIN "app"."work_order_steps" s ON s."work_order_id" = l."work_order_id"
JOIN "app"."process_step_catalog" c ON c."id" = s."process_step_id"
JOIN "app"."inspection_templates" t ON t."id" = l."inspection_template_id"
WHERE c."is_inspection"
  AND (t."related_process_step_id" IS NULL
       OR t."related_process_step_id" = s."process_step_id")
ON CONFLICT DO NOTHING;

-- 3. 旧テーブルを削除
DROP TABLE "app"."work_order_inspection_templates";
