-- プロフィール写真（アプリ内アップロード。AD からは取得しない）。
-- 実体は SeaweedFS `avatars/…`、参照は app.files 行。

-- AlterTable
ALTER TABLE "app"."users" ADD COLUMN "avatar_file_id" UUID;

-- CreateIndex
CREATE INDEX "users_avatar_file_id_idx" ON "app"."users"("avatar_file_id");

-- AddForeignKey
ALTER TABLE "app"."users" ADD CONSTRAINT "users_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "app"."files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
