-- CreateTable
CREATE TABLE "app"."file_folder_grants" (
    "id" SERIAL NOT NULL,
    "path_prefix" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "can_write" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_folder_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_folder_grants_user_id_idx" ON "app"."file_folder_grants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_folder_grants_path_prefix_user_id_key" ON "app"."file_folder_grants"("path_prefix", "user_id");

-- AddForeignKey
ALTER TABLE "app"."file_folder_grants" ADD CONSTRAINT "file_folder_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."file_folder_grants" ADD CONSTRAINT "file_folder_grants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

