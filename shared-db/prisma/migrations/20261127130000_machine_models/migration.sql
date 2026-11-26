-- allow-destructive: design_programs.work_location_id の FK だけを外す（列は残す・旧アプリは書けるまま）。approval_flows_target_type_check は張り直して値の集合を広げるだけ。program_key の NOT NULL は旧アプリの INSERT を BEFORE INSERT トリガーで埋めるので壊さない
-- 機種マスタと、加工プログラムの機種割り当て・版・使用記録・変更申請
--
-- 1. machine_models（作業場所マスタ MS0D の中で管理する機種）
--    work_locations.machine_model_id — 1 台の機械は機種を 0..1 持つ。
-- 2. design_program_machine_models — プログラムは機種を 0..N 持つ（0 = 機種を
--    問わない）。以前の design_programs.work_location_id（機械 1 台）は使わない
--    （列は @ignore で残置。DROP は昇格後の後続 PR）。**既存のプログラムは
--    機種を持たない（= 機種を問わない）として残す** — 移行時点で機種は 1 つも
--    無いので、機械から機種を推すことはできない（#972 の本番データも無い）。
-- 3. プログラムの版 — design_programs の 1 行 = 1 版。program_key（版をまたいだ
--    同一性。既存行は自分の id）+ revision（既存行は 1）+ superseded_at +
--    retired_at。
-- 4. work_order_step_programs — 工程を開始したときに出ていた版の記録。行のある
--    版は「使用済み」で、その場では書き換えず新しい版を作る。
-- 5. design_program_changes — 変更申請（追加 / 直す / 新しい版 / 削除 / 廃止）。
--    承認設定（MS0B）の新しい書類種別 design_program_changes に段が 1 つでも
--    あれば承認を通し、無ければ申請と同時に当てる（未設定 = 素通し）。
--
-- ローリングデプロイ:
--   * 表・列は足すだけ。旧アプリは program_key を知らないので、INSERT で空の
--     ときは id で埋めるトリガーを置く（旧アプリが作った行も v1 として読める）。
--   * work_location_id の FK は外すが列は残す — 旧アプリは書き続けられる。
--   * approval_flows_target_type_check は値の集合を広げるだけ（前例:
--     20261126250000_work_order_aborts）。旧アプリは design_program_changes を
--     書かない。
-- DropForeignKey
ALTER TABLE "app"."design_programs" DROP CONSTRAINT "design_programs_work_location_id_fkey";

-- AlterTable
ALTER TABLE "app"."design_programs" ADD COLUMN     "program_key" UUID,
ADD COLUMN     "retired_at" TIMESTAMPTZ(6),
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "superseded_at" TIMESTAMPTZ(6);

-- 既存のプログラムは v1（版をまたいだ同一性 = 自分の id）。
UPDATE "app"."design_programs" SET "program_key" = "id" WHERE "program_key" IS NULL;
ALTER TABLE "app"."design_programs" ALTER COLUMN "program_key" SET NOT NULL;

-- 旧アプリ（program_key を知らない）の INSERT は id で埋める = v1。
CREATE FUNCTION "app".design_programs_default_key() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.program_key IS NULL THEN
    NEW.program_key := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER design_programs_default_key BEFORE INSERT ON "app"."design_programs"
  FOR EACH ROW EXECUTE FUNCTION "app".design_programs_default_key();

-- AlterTable
ALTER TABLE "app"."work_locations" ADD COLUMN     "machine_model_id" INTEGER;

-- CreateTable
CREATE TABLE "app"."design_program_machine_models" (
    "program_id" UUID NOT NULL,
    "machine_model_id" INTEGER NOT NULL,

    CONSTRAINT "design_program_machine_models_pkey" PRIMARY KEY ("program_id","machine_model_id")
);

-- CreateTable
CREATE TABLE "app"."design_program_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "design_version_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "program_id" UUID,
    "payload" JSONB,
    "new_file_id" UUID,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "applied_program_id" UUID,
    "applied_at" TIMESTAMPTZ(6),
    "requested_by" UUID,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "design_program_changes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "design_program_changes_kind_check"
      CHECK ("kind" = ANY (ARRAY['ADD'::text, 'EDIT'::text, 'REVISE'::text, 'DELETE'::text, 'RETIRE'::text])),
    CONSTRAINT "design_program_changes_status_check"
      CHECK ("status" = ANY (ARRAY['PENDING'::text, 'APPLIED'::text, 'REJECTED'::text, 'CANCELLED'::text, 'FAILED'::text])),
    -- 追加以外は「どの版を基にしたか」を必ず持つ（申請時点）。
    CONSTRAINT "design_program_changes_base_check"
      CHECK ("kind" = 'ADD' OR "status" <> 'PENDING' OR "program_id" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "app"."machine_models" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "maker" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "machine_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."work_order_step_programs" (
    "step_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_step_programs_pkey" PRIMARY KEY ("step_id","program_id")
);

-- CreateIndex
CREATE INDEX "design_program_machine_models_machine_model_id_idx" ON "app"."design_program_machine_models"("machine_model_id");

-- CreateIndex
CREATE INDEX "design_program_changes_design_version_id_status_idx" ON "app"."design_program_changes"("design_version_id", "status");

-- CreateIndex
CREATE INDEX "design_program_changes_program_id_idx" ON "app"."design_program_changes"("program_id");

-- CreateIndex
CREATE UNIQUE INDEX "machine_models_code_key" ON "app"."machine_models"("code");

-- CreateIndex
CREATE INDEX "work_order_step_programs_program_id_idx" ON "app"."work_order_step_programs"("program_id");

-- CreateIndex
CREATE UNIQUE INDEX "design_programs_program_key_revision_key" ON "app"."design_programs"("program_key", "revision");

-- CreateIndex
CREATE INDEX "work_locations_machine_model_id_idx" ON "app"."work_locations"("machine_model_id");

-- AddForeignKey
ALTER TABLE "app"."design_program_machine_models" ADD CONSTRAINT "design_program_machine_models_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "app"."design_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."design_program_machine_models" ADD CONSTRAINT "design_program_machine_models_machine_model_id_fkey" FOREIGN KEY ("machine_model_id") REFERENCES "app"."machine_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."design_program_changes" ADD CONSTRAINT "design_program_changes_design_version_id_fkey" FOREIGN KEY ("design_version_id") REFERENCES "app"."design_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."design_program_changes" ADD CONSTRAINT "design_program_changes_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "app"."design_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."design_program_changes" ADD CONSTRAINT "design_program_changes_applied_program_id_fkey" FOREIGN KEY ("applied_program_id") REFERENCES "app"."design_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."design_program_changes" ADD CONSTRAINT "design_program_changes_new_file_id_fkey" FOREIGN KEY ("new_file_id") REFERENCES "app"."files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."design_program_changes" ADD CONSTRAINT "design_program_changes_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."design_program_changes" ADD CONSTRAINT "design_program_changes_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."work_locations" ADD CONSTRAINT "work_locations_machine_model_id_fkey" FOREIGN KEY ("machine_model_id") REFERENCES "app"."machine_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."work_order_step_programs" ADD CONSTRAINT "work_order_step_programs_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "app"."work_order_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."work_order_step_programs" ADD CONSTRAINT "work_order_step_programs_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "app"."design_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- 進行中の申請は 1 プログラム（の基にした版）に 1 件だけ。
CREATE UNIQUE INDEX "design_program_changes_one_pending"
  ON "app"."design_program_changes"("program_id") WHERE ("status" = 'PENDING' AND "program_id" IS NOT NULL);

COMMENT ON TABLE "app"."design_program_changes" IS '加工プログラムの変更申請。承認設定に段が無ければ申請と同時に当てる。当てるときに基にした版がまだ現行版・未使用かを確かめ、崩れていれば FAILED。';
COMMENT ON TABLE "app"."work_order_step_programs" IS '工程を開始したときに出ていた加工プログラムの版。行のある版は使用済み（書き換えず新しい版を作る）。';
COMMENT ON TABLE "app"."machine_models" IS '機種（作業場所マスタ MS0D の中で管理）。機械は 0..1、加工プログラムは 0..N の機種を持つ。';

-- 承認依頼（approval_requests）は申請の uuid を多態参照で指す — 申請行が
-- 消えたら承認依頼・メモ・添付も消す（工程フロー変更・打ち切りと同じ）。
CREATE TRIGGER purge_children_after_delete AFTER DELETE ON "app"."design_program_changes"
  FOR EACH ROW EXECUTE FUNCTION "app".purge_document_children('design_program_changes', 'col', 'id');

-- ─── 承認フローの対象に「加工プログラムの変更」を足す ──────────────────────
ALTER TABLE "app"."approval_flows" DROP CONSTRAINT IF EXISTS "approval_flows_target_type_check";
ALTER TABLE "app"."approval_flows" ADD CONSTRAINT "approval_flows_target_type_check"
  CHECK (target_type = ANY (ARRAY[
    'work_orders'::text,
    'order_acceptances'::text,
    'material_purchase_orders'::text,
    'purchase_requests'::text,
    'work_order_flow_changes'::text,
    'order_acceptance_cancel_requests'::text,
    'form_responses'::text,
    'internal_pages'::text,
    'design_requests'::text,
    'delivery_orders'::text,
    'stock_takes'::text,
    'invoices'::text,
    'invoice_payments'::text,
    'design_versions'::text,
    'price_list_entries'::text,
    'work_order_aborts'::text,
    'design_program_changes'::text
  ]));
