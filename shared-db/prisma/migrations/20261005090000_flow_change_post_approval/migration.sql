-- 工程フロー変更の 即時適用 + 事後承認（打合せメモ 3/2「進行中の製造フローの
-- 変更は即時反映のうえ、承認を必要とする」対応）。
-- approval_flows.apply_mode: PRE（既定 = 承認後に適用・従来動作）/
-- POST（即時適用 + 事後承認）。状態は status × applied_at × acknowledged_at の
-- 直交で表現し、status の CHECK は変えない:
--   PENDING  + applied_at   = 適用済み・承認待ち
--   REJECTED + applied_at + 未 ack = 差し戻されたが適用済み（警告 → 人が確認）

-- AlterTable
ALTER TABLE "app"."approval_flows" ADD COLUMN     "apply_mode" TEXT NOT NULL DEFAULT 'PRE';

ALTER TABLE "app"."approval_flows" ADD CONSTRAINT "approval_flows_apply_mode_check"
  CHECK ("apply_mode" IN ('PRE', 'POST'));

-- AlterTable
ALTER TABLE "app"."work_order_flow_changes" ADD COLUMN     "acknowledged_at" TIMESTAMPTZ(6),
ADD COLUMN     "acknowledged_by" UUID,
ADD COLUMN     "applied_at" TIMESTAMPTZ(6);

-- AddForeignKey
ALTER TABLE "app"."work_order_flow_changes" ADD CONSTRAINT "work_order_flow_changes_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
