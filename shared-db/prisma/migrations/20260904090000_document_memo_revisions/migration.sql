-- メモ / コメントの改訂履歴（証跡）を追加する。
--
-- 目的はセキュリティ・監査: 誰がいつ何を書き換えたか、書き換え前の本文は
-- 何だったかを追えるようにする。audit_logs には平文の要約しか残らないため、
-- 突き合わせに耐える完全な本文スナップショットをこの表に持つ。
--
-- 1 行 = 1 操作（CREATE / UPDATE / DELETE / ARCHIVE / RESTORE）。
-- memo_id は ON DELETE SET NULL — **本体を削除しても履歴は残す**
-- （削除の証跡が一緒に消えては監査にならない）。owner_type / owner_id を
-- 併記してあるので、本体が無くなっても対象文書は追跡できる。
--
-- 純粋な追加のみ。既存テーブル・既存データには触れない。
-- 既存メモの初版は履歴を持たない（導入以前の操作は記録されていないため）。
-- ロールバック: DROP TABLE "app"."document_memo_revisions";

-- CreateTable
CREATE TABLE "app"."document_memo_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "memo_id" UUID,
    "owner_type" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "plain_text" TEXT NOT NULL,
    "edited_by" UUID,
    "edited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_memo_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_memo_revisions_memo_id_edited_at_idx" ON "app"."document_memo_revisions"("memo_id", "edited_at");

-- CreateIndex
CREATE INDEX "document_memo_revisions_owner_type_owner_id_edited_at_idx" ON "app"."document_memo_revisions"("owner_type", "owner_id", "edited_at");

-- AddForeignKey
ALTER TABLE "app"."document_memo_revisions" ADD CONSTRAINT "document_memo_revisions_memo_id_fkey" FOREIGN KEY ("memo_id") REFERENCES "app"."document_memos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."document_memo_revisions" ADD CONSTRAINT "document_memo_revisions_edited_by_fkey" FOREIGN KEY ("edited_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

