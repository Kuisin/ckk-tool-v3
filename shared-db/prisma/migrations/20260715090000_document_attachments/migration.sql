-- CreateTable
CREATE TABLE "app"."document_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_type" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "file_id" UUID NOT NULL,
    "label" TEXT,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_attachments_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "document_attachments_owner_type_owner_id_idx" ON "app"."document_attachments"("owner_type", "owner_id");
-- AddForeignKey
ALTER TABLE "app"."document_attachments" ADD CONSTRAINT "document_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "app"."files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."document_attachments" ADD CONSTRAINT "document_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
