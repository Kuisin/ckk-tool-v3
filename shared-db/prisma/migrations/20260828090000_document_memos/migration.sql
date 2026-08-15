-- 文書メモ / コメント（社内向けリッチテキスト）テーブルの追加。
--   owner は document_attachments・audit_logs と同じ多態参照
--   （owner_type = @@map 名 / owner_id = 業務キー文字列）。
--   kind = MEMO    … 1 文書 1 件（見積書 / 注文請書 / 指示書 / 出荷書 / 請求書）
--   kind = COMMENT … 1 文書に複数件の投稿スレッド（価格表 / 試算）
--   content は ProseMirror ドキュメント JSON（HTML 文字列では保存しない）。
--   plain_text はその平文射影 — 一覧プレビューと監査ログの可読性のため。
--
-- 純粋な追加のみ。既存テーブル・既存データには一切触れない。
-- ロールバック: DROP TABLE "app"."document_memos";

-- CreateTable
CREATE TABLE "app"."document_memos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_type" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "plain_text" TEXT NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_memos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_memos_owner_type_owner_id_created_at_idx" ON "app"."document_memos"("owner_type", "owner_id", "created_at");

-- AddForeignKey
ALTER TABLE "app"."document_memos" ADD CONSTRAINT "document_memos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."document_memos" ADD CONSTRAINT "document_memos_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
