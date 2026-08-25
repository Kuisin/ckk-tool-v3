-- 社内文書 (CM03, /general/documents) — 文書 / 不変リビジョン / 行 blame /
-- 行単位コメント。
--
-- 設計意図は prisma/schema/internal-pages.prisma のコメントを見ること。要点:
--   * 本文は Markdown ソース。行番号が安定していないと行コメントと行差分が
--     作れないため、ProseMirror JSON ではなく素のテキストで持つ。
--   * リビジョンは不変。「復元」も過去の内容で新しいリビジョンを作る。
--   * 行コメントは anchor_line（付けた版での行）と anchor_text（当時の行の内容）を
--     必ず持ち、current_line が null になっても「何への指摘か」が読める。
--   * 共有は forms (CM02) と同じ share_grants を owner_type='internal_pages' で使う。

-- CreateEnum
CREATE TYPE "app"."InternalPageStatus" AS ENUM ('DRAFT', 'PENDING', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "app"."InternalPageRevisionAction" AS ENUM ('CREATE', 'UPDATE', 'PUBLISH', 'RESTORE', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "app"."LineCommentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "app"."internal_pages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "page_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "folder" TEXT,
    "status" "app"."InternalPageStatus" NOT NULL DEFAULT 'DRAFT',
    "approval_required" BOOLEAN NOT NULL DEFAULT false,
    "published_revision" INTEGER,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "internal_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."internal_page_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "page_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "note" TEXT,
    "action" "app"."InternalPageRevisionAction" NOT NULL,
    "added_lines" INTEGER NOT NULL DEFAULT 0,
    "removed_lines" INTEGER NOT NULL DEFAULT 0,
    "edited_by" UUID,
    "edited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_page_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."internal_page_line_blame" (
    "page_id" UUID NOT NULL,
    "line" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "edited_by" UUID,
    "edited_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "internal_page_line_blame_pkey" PRIMARY KEY ("page_id","line")
);

-- CreateTable
CREATE TABLE "app"."internal_page_line_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "page_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "anchor_line" INTEGER NOT NULL,
    "anchor_text" TEXT NOT NULL,
    "current_line" INTEGER,
    "body" TEXT NOT NULL,
    "status" "app"."LineCommentStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "internal_page_line_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "internal_pages_page_number_key" ON "app"."internal_pages"("page_number");

-- CreateIndex
CREATE INDEX "internal_pages_status_updated_at_idx" ON "app"."internal_pages"("status", "updated_at");

-- CreateIndex
CREATE INDEX "internal_pages_folder_idx" ON "app"."internal_pages"("folder");

-- CreateIndex
CREATE INDEX "internal_page_revisions_page_id_edited_at_idx" ON "app"."internal_page_revisions"("page_id", "edited_at");

-- CreateIndex
CREATE UNIQUE INDEX "internal_page_revisions_page_id_revision_key" ON "app"."internal_page_revisions"("page_id", "revision");

-- CreateIndex
CREATE INDEX "internal_page_line_comments_page_id_status_idx" ON "app"."internal_page_line_comments"("page_id", "status");

-- CreateIndex
CREATE INDEX "internal_page_line_comments_thread_id_idx" ON "app"."internal_page_line_comments"("thread_id");

-- AddForeignKey
ALTER TABLE "app"."internal_pages" ADD CONSTRAINT "internal_pages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."internal_pages" ADD CONSTRAINT "internal_pages_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."internal_page_revisions" ADD CONSTRAINT "internal_page_revisions_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "app"."internal_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."internal_page_revisions" ADD CONSTRAINT "internal_page_revisions_edited_by_fkey" FOREIGN KEY ("edited_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."internal_page_line_blame" ADD CONSTRAINT "internal_page_line_blame_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "app"."internal_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."internal_page_line_blame" ADD CONSTRAINT "internal_page_line_blame_edited_by_fkey" FOREIGN KEY ("edited_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."internal_page_line_comments" ADD CONSTRAINT "internal_page_line_comments_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "app"."internal_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."internal_page_line_comments" ADD CONSTRAINT "internal_page_line_comments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."internal_page_line_comments" ADD CONSTRAINT "internal_page_line_comments_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── 多態な子レコードの後始末 ────────────────────────────────────────────────
-- 承認依頼・メモ・添付は業務キー文字列で紐づき FK が無いので、AFTER DELETE で掃除する
-- （既存 12 テーブルと同じ規約。Prisma のスキーマからは見えないので手で書く）。
CREATE TRIGGER purge_children_after_delete
AFTER DELETE ON "app"."internal_pages"
FOR EACH ROW EXECUTE FUNCTION app.purge_document_children('internal_pages', 'col', 'page_number');

-- 共有設定も同様（PR: フォームで入れた app.purge_share_grants を使う）。
CREATE TRIGGER purge_share_grants_after_delete
AFTER DELETE ON "app"."internal_pages"
FOR EACH ROW EXECUTE FUNCTION app.purge_share_grants('internal_pages', 'page_number');

-- ─── 承認対象の追加 ──────────────────────────────────────────────────────────
-- 「公開に承認が必要」な文書のため、approval_flows.target_type の CHECK に
-- internal_pages を足す。張り替えないと MS0B でフローを作れない。
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
    'internal_pages'::text
  ]));
