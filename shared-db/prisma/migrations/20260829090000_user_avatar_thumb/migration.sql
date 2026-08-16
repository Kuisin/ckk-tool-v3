-- プロフィール写真のサムネイル（一覧・ヘッダー・履歴用の小サイズ）。
-- 大サイズ（avatar_file_id）と同じく app.files を参照する。

-- AlterTable
ALTER TABLE "app"."users" ADD COLUMN "avatar_thumb_file_id" UUID;

-- CreateIndex
CREATE INDEX "users_avatar_thumb_file_id_idx" ON "app"."users"("avatar_thumb_file_id");

-- AddForeignKey
ALTER TABLE "app"."users" ADD CONSTRAINT "users_avatar_thumb_file_id_fkey" FOREIGN KEY ("avatar_thumb_file_id") REFERENCES "app"."files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
