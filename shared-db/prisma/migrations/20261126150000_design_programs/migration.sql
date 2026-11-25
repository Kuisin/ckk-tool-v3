-- 設計図 (PD06) の加工プログラムと、系列で共有するメモ。
--
-- 1. design_programs / design_program_steps
--    版 (design_versions) ごとの加工プログラム。1 本が N 工程を受け持つので
--    工程は子表で持つ。機械のマスタは作らない — 作業場所 (work_locations,
--    MS0D) が機械そのもので、work_location_id が「どの機械向けか」の印。
--    版を消すとプログラムも消える（cascade）。
--
-- 2. 系列メモ（document_memos.owner_type = 'design_series'）
--    owner_id は '<item_id>:<customer_bp_id | generic>'。系列 (製品 × 受注元)
--    には行が無いので FK も purge_document_children も張れない。代わりに版の
--    削除で「その系列に版が 1 つも残らなかったら」系列メモを消す。版がまだ
--    残っているうちは系列も残っているので、メモも残す。

-- CreateTable
CREATE TABLE "app"."design_programs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "design_version_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "program_number" TEXT,
    "file_id" UUID,
    "work_location_id" INTEGER,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "design_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."design_program_steps" (
    "program_id" UUID NOT NULL,
    "process_step_id" INTEGER NOT NULL,

    CONSTRAINT "design_program_steps_pkey" PRIMARY KEY ("program_id","process_step_id")
);

-- CreateIndex
CREATE INDEX "design_programs_design_version_id_sort_order_idx" ON "app"."design_programs"("design_version_id", "sort_order");

-- CreateIndex
CREATE INDEX "design_program_steps_process_step_id_idx" ON "app"."design_program_steps"("process_step_id");

-- AddForeignKey
ALTER TABLE "app"."design_programs" ADD CONSTRAINT "design_programs_design_version_id_fkey" FOREIGN KEY ("design_version_id") REFERENCES "app"."design_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."design_programs" ADD CONSTRAINT "design_programs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "app"."files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."design_programs" ADD CONSTRAINT "design_programs_work_location_id_fkey" FOREIGN KEY ("work_location_id") REFERENCES "app"."work_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."design_programs" ADD CONSTRAINT "design_programs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."design_program_steps" ADD CONSTRAINT "design_program_steps_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "app"."design_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."design_program_steps" ADD CONSTRAINT "design_program_steps_process_step_id_fkey" FOREIGN KEY ("process_step_id") REFERENCES "app"."process_step_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 系列メモの掃除 ──────────────────────────────────────────────────────────
CREATE FUNCTION app.purge_design_series_memos() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_owner_id text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM app.design_versions
     WHERE item_id = OLD.item_id
       AND customer_bp_id IS NOT DISTINCT FROM OLD.customer_bp_id
  ) THEN
    RETURN OLD;  -- 系列はまだ残っている
  END IF;
  v_owner_id := OLD.item_id::text || ':' || COALESCE(OLD.customer_bp_id::text, 'generic');
  DELETE FROM app.document_memos
   WHERE owner_type = 'design_series' AND owner_id = v_owner_id;
  DELETE FROM app.document_memo_revisions
   WHERE owner_type = 'design_series' AND owner_id = v_owner_id;
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION app.purge_design_series_memos() IS '設計図の版を消したとき、その系列 (製品 × 受注元) に版が残っていなければ系列メモ (owner_type design_series) を消す。';

CREATE TRIGGER purge_design_series_memos_after_delete
  AFTER DELETE ON app.design_versions
  FOR EACH ROW
  EXECUTE FUNCTION app.purge_design_series_memos();
