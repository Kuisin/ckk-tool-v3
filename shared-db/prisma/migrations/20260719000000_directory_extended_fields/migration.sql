-- Shared directory: persist extended AD person attributes. The table is owned
-- by ldap_sync (which also ADDs these columns at runtime), so we ALTER with
-- IF NOT EXISTS here to keep readers (Prisma clients, Metabase SELECT * views)
-- in sync before the next full sync run.
ALTER TABLE "directory"."employee_directory" ADD COLUMN IF NOT EXISTS "given_name" TEXT;
ALTER TABLE "directory"."employee_directory" ADD COLUMN IF NOT EXISTS "sn" TEXT;
ALTER TABLE "directory"."employee_directory" ADD COLUMN IF NOT EXISTS "cn" TEXT;
ALTER TABLE "directory"."employee_directory" ADD COLUMN IF NOT EXISTS "upn" TEXT;
ALTER TABLE "directory"."employee_directory" ADD COLUMN IF NOT EXISTS "dn" TEXT;
ALTER TABLE "directory"."employee_directory" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "directory"."employee_directory" ADD COLUMN IF NOT EXISTS "mobile" TEXT;
ALTER TABLE "directory"."employee_directory" ADD COLUMN IF NOT EXISTS "fax" TEXT;
ALTER TABLE "directory"."employee_directory" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "directory"."employee_directory" ADD COLUMN IF NOT EXISTS "member_of" TEXT[];
ALTER TABLE "directory"."employee_directory" ADD COLUMN IF NOT EXISTS "when_created" TIMESTAMPTZ(6);
ALTER TABLE "directory"."employee_directory" ADD COLUMN IF NOT EXISTS "when_changed" TIMESTAMPTZ(6);
ALTER TABLE "directory"."employee_directory" ADD COLUMN IF NOT EXISTS "account_expires" TIMESTAMPTZ(6);
