-- フォーム (CM02, /general/forms) — 定義 / 不変バージョン / 回答 と、
-- レコード単位の共有 (share_grants)。
--
-- 設計意図は prisma/schema/forms.prisma のコメントを見ること。要点だけ:
--   * 定義は「Form 行 + 不変な FormVersion 行」。回答は回答時点の version を指すので、
--     あとから項目を消しても過去の回答の意味が壊れない。
--   * form_responses.submitted_by は NOT NULL — 回答者は常に記録する。
--     画面に出すかどうかだけを forms.respondent_visibility が決める。
--   * share_grants は forms と internal_pages (CM03) が共用する多態テーブル。
--     owner_type = @@map 名 / owner_id = 業務キー文字列 / FK は張らない
--     （audit_logs・document_memos・document_attachments と同じ規約）。

-- CreateEnum
CREATE TYPE "app"."FormKind" AS ENUM ('SURVEY', 'REQUEST');

-- CreateEnum
CREATE TYPE "app"."FormStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "app"."RespondentVisibility" AS ENUM ('SHOWN', 'HIDDEN');

-- CreateEnum
CREATE TYPE "app"."ResponseEditMode" AS ENUM ('NONE', 'UNTIL_CLOSE', 'UNTIL_DATE');

-- CreateEnum
CREATE TYPE "app"."FormResponseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "app"."ShareSubjectType" AS ENUM ('EVERYONE', 'PLANT', 'ROLE', 'USER');

-- CreateEnum
CREATE TYPE "app"."ShareLevel" AS ENUM ('RESPOND', 'READ', 'EDIT', 'MANAGE');

-- CreateTable
CREATE TABLE "app"."forms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "app"."FormKind" NOT NULL,
    "status" "app"."FormStatus" NOT NULL DEFAULT 'DRAFT',
    "respondent_visibility" "app"."RespondentVisibility" NOT NULL DEFAULT 'SHOWN',
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "record_seq" INTEGER NOT NULL DEFAULT 0,
    "approval_enabled" BOOLEAN NOT NULL DEFAULT false,
    "allow_multiple" BOOLEAN NOT NULL DEFAULT true,
    "opens_at" TIMESTAMPTZ(6),
    "closes_at" TIMESTAMPTZ(6),
    "response_edit_mode" "app"."ResponseEditMode" NOT NULL DEFAULT 'NONE',
    "response_editable_until" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."form_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "form_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "schema" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" UUID,

    CONSTRAINT "form_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."form_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "response_number" TEXT NOT NULL,
    "record_no" INTEGER NOT NULL,
    "form_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "app"."FormResponseStatus" NOT NULL DEFAULT 'DRAFT',
    "answers" JSONB NOT NULL,
    "plain_text" TEXT,
    "submitted_by" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "rejected_at" TIMESTAMPTZ(6),
    "reject_reason" TEXT,
    "history" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "form_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."share_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_type" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "subject_type" "app"."ShareSubjectType" NOT NULL,
    "subject_id" TEXT,
    "level" "app"."ShareLevel" NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "forms_code_key" ON "app"."forms"("code");

-- CreateIndex
CREATE INDEX "forms_status_updated_at_idx" ON "app"."forms"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "form_versions_form_id_version_key" ON "app"."form_versions"("form_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "form_responses_response_number_key" ON "app"."form_responses"("response_number");

-- CreateIndex
CREATE INDEX "form_responses_form_id_status_idx" ON "app"."form_responses"("form_id", "status");

-- CreateIndex
CREATE INDEX "form_responses_submitted_by_created_at_idx" ON "app"."form_responses"("submitted_by", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "form_responses_form_id_record_no_key" ON "app"."form_responses"("form_id", "record_no");

-- CreateIndex
CREATE INDEX "share_grants_owner_type_owner_id_idx" ON "app"."share_grants"("owner_type", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "share_grants_owner_type_owner_id_subject_type_subject_id_le_key" ON "app"."share_grants"("owner_type", "owner_id", "subject_type", "subject_id", "level");

-- AddForeignKey
ALTER TABLE "app"."forms" ADD CONSTRAINT "forms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."forms" ADD CONSTRAINT "forms_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."form_versions" ADD CONSTRAINT "form_versions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "app"."forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."form_versions" ADD CONSTRAINT "form_versions_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."form_responses" ADD CONSTRAINT "form_responses_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "app"."forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."form_responses" ADD CONSTRAINT "form_responses_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."share_grants" ADD CONSTRAINT "share_grants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── 多態な子レコードの後始末 ────────────────────────────────────────────────
-- 承認依頼・メモ・添付は業務キー文字列で紐づき FK が無いので、本体を消しても
-- 残ってしまう。既存の 12 テーブルと同じく AFTER DELETE トリガで掃除する
-- （Prisma のスキーマからは見えないため、文書テーブルを足したら手で書くこと）。
CREATE TRIGGER purge_children_after_delete
AFTER DELETE ON "app"."form_responses"
FOR EACH ROW EXECUTE FUNCTION app.purge_document_children('form_responses', 'col', 'response_number');

-- share_grants も同じ理由（FK が無い）で手で掃除する。owner_type と、業務キーが
-- 入っている列名を TG_ARGV で受ける — purge_document_children と同じ書き方。
CREATE FUNCTION app.purge_share_grants() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_owner_type text  := TG_ARGV[0];
  v_owner_id   text  := to_jsonb(OLD) ->> TG_ARGV[1];
BEGIN
  IF v_owner_id IS NULL THEN
    RETURN OLD;
  END IF;

  DELETE FROM app.share_grants
   WHERE owner_type = v_owner_type AND owner_id = v_owner_id;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION app.purge_share_grants() IS 'レコード共有の親が消えたときに share_grants を掃除する。owner_type と業務キーの列名を TG_ARGV で受ける。';

CREATE TRIGGER purge_share_grants_after_delete
AFTER DELETE ON "app"."forms"
FOR EACH ROW EXECUTE FUNCTION app.purge_share_grants('forms', 'code');

-- ─── 承認対象の追加 ──────────────────────────────────────────────────────────
-- approval_flows.target_type の CHECK に form_responses を足す。ここを張り替えないと
-- 承認設定 (MS0B) でフローを作れず、startApprovalFlow が必ず失敗する。
ALTER TABLE "app"."approval_flows" DROP CONSTRAINT IF EXISTS "approval_flows_target_type_check";
ALTER TABLE "app"."approval_flows" ADD CONSTRAINT "approval_flows_target_type_check"
  CHECK (target_type = ANY (ARRAY[
    'work_orders'::text,
    'order_acceptances'::text,
    'material_purchase_orders'::text,
    'purchase_requests'::text,
    'work_order_flow_changes'::text,
    'order_acceptance_cancel_requests'::text,
    'form_responses'::text
  ]));
