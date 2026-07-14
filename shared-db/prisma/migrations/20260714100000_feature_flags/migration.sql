-- CreateTable
CREATE TABLE "app"."feature_flags" (
    "key" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);
-- AddForeignKey
ALTER TABLE "app"."feature_flags" ADD CONSTRAINT "feature_flags_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
