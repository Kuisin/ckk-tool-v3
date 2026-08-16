-- 文書コメントのアーカイブ（畳んで残す）対応。
--   archived_at 非 null = スレッド上では折りたたみ表示。削除ではないので
--   展開すれば本文はそのまま読める（誰が畳んだかを archived_by に残す）。
--
-- null 許容カラムの追加のみ。既存行は archived_at = NULL（=通常表示）に
-- なるので、データ移行は不要。
-- ロールバック:
--   ALTER TABLE "app"."document_memos"
--     DROP COLUMN "archived_at", DROP COLUMN "archived_by";

-- AlterTable
ALTER TABLE "app"."document_memos" ADD COLUMN     "archived_at" TIMESTAMPTZ(6),
ADD COLUMN     "archived_by" UUID;

-- AddForeignKey
ALTER TABLE "app"."document_memos" ADD CONSTRAINT "document_memos_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
