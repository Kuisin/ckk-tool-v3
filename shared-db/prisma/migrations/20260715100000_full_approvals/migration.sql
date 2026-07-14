-- CreateEnum
CREATE TYPE "app"."APPROVAL_STEP" AS ENUM ('FIRST', 'SECOND');
-- CreateEnum
CREATE TYPE "app"."APPROVAL_REQUEST_STATUS" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
-- CreateEnum
CREATE TYPE "app"."APPROVAL_ACTION" AS ENUM ('APPROVED', 'REJECTED');
-- CreateTable
CREATE TABLE "app"."approval_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "step" "app"."APPROVAL_STEP" NOT NULL,
    "status" "app"."APPROVAL_REQUEST_STATUS" NOT NULL DEFAULT 'PENDING',
    "requested_by" UUID,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."approval_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "approval_request_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "delegate_for_id" UUID,
    "action" "app"."APPROVAL_ACTION" NOT NULL,
    "comment" TEXT,
    "acted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_records_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."approval_delegates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" INTEGER NOT NULL,
    "delegator_id" UUID NOT NULL,
    "delegate_id" UUID NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_delegates_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "approval_requests_target_type_target_id_idx" ON "app"."approval_requests"("target_type", "target_id");
-- CreateIndex
CREATE INDEX "approval_requests_status_idx" ON "app"."approval_requests"("status");
-- CreateIndex
CREATE INDEX "approval_records_approval_request_id_idx" ON "app"."approval_records"("approval_request_id");
-- CreateIndex
CREATE INDEX "approval_delegates_group_id_valid_from_valid_until_idx" ON "app"."approval_delegates"("group_id", "valid_from", "valid_until");
-- CreateIndex
CREATE INDEX "approval_delegates_delegate_id_idx" ON "app"."approval_delegates"("delegate_id");
-- AddForeignKey
ALTER TABLE "app"."approval_requests" ADD CONSTRAINT "approval_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."approval_records" ADD CONSTRAINT "approval_records_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "app"."approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."approval_records" ADD CONSTRAINT "approval_records_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."approval_records" ADD CONSTRAINT "approval_records_delegate_for_id_fkey" FOREIGN KEY ("delegate_for_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."approval_delegates" ADD CONSTRAINT "approval_delegates_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "app"."approval_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."approval_delegates" ADD CONSTRAINT "approval_delegates_delegator_id_fkey" FOREIGN KEY ("delegator_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."approval_delegates" ADD CONSTRAINT "approval_delegates_delegate_id_fkey" FOREIGN KEY ("delegate_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."approval_delegates" ADD CONSTRAINT "approval_delegates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
