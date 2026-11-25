-- allow-destructive: approval_flows_target_type_check は張り直すだけで値の集合は広がる（旧アプリは work_order_aborts を書かない）
-- 指示書の打ち切り（仕掛品再設計 PR 6/7）
--
-- 進行中の指示書を止め、流れの途中にある良品を仕掛品として在庫へ戻す。
-- 申請は work_order_flow_changes と同じ形（保留 → 承認 → 適用）で、承認設定
-- （MS0B）の新しい書類種別 work_order_aborts に段が 1 つでもあれば承認を通す。
-- 段が無ければ申請と同時に適用する（未設定 = 素通し）。
--
-- ローリングデプロイ:
--   * 表・列・enum 値は足すだけ。旧アプリは知らないので触らない。
--   * approval_flows_target_type_check は値の集合を広げるだけ
--     （前例: 20261124090000_custom_value_approval）。
--   * 打ち切った指示書の status は既存の CANCELLED — 旧アプリにも「終わった
--     指示書」として読める。違いは work_orders.aborted_at だけが持つ。

-- ─── 1. 打ち切りの申請 ─────────────────────────────────────────────────────
CREATE TABLE "app"."work_order_aborts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "applied_at" TIMESTAMPTZ(6),
    "requested_by" UUID,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "work_order_aborts_pkey" PRIMARY KEY ("id"),
    -- 理由の無い打ち切りを作らない（利用者の決定 2026-11-25: 理由は常に必須）。
    CONSTRAINT "work_order_aborts_reason_check" CHECK (btrim("reason") <> ''),
    CONSTRAINT "work_order_aborts_status_check"
      CHECK ("status" = ANY (ARRAY['PENDING'::text, 'APPLIED'::text, 'REJECTED'::text, 'CANCELLED'::text, 'FAILED'::text]))
);

CREATE INDEX "work_order_aborts_work_order_id_status_idx"
  ON "app"."work_order_aborts"("work_order_id", "status");

-- 進行中の申請は 1 指示書に 1 件だけ（工程フロー変更と同じ）。
CREATE UNIQUE INDEX "work_order_aborts_one_pending"
  ON "app"."work_order_aborts"("work_order_id") WHERE ("status" = 'PENDING');

ALTER TABLE "app"."work_order_aborts"
  ADD CONSTRAINT "work_order_aborts_work_order_id_fkey"
  FOREIGN KEY ("work_order_id") REFERENCES "app"."work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."work_order_aborts"
  ADD CONSTRAINT "work_order_aborts_requested_by_fkey"
  FOREIGN KEY ("requested_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."work_order_aborts"
  ADD CONSTRAINT "work_order_aborts_resolved_by_fkey"
  FOREIGN KEY ("resolved_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "app"."work_order_aborts" IS '指示書の打ち切り申請。承認設定に段が無ければ申請と同時に適用する。適用時にいまの工程の状態で突き合わせ、崩れていれば FAILED。';

-- 承認依頼（approval_requests）は申請の uuid を多態参照で指す — 申請行が
-- 消えたら承認依頼・メモ・添付も消す（工程フロー変更と同じ）。
CREATE TRIGGER purge_children_after_delete AFTER DELETE ON "app"."work_order_aborts"
  FOR EACH ROW EXECUTE FUNCTION "app".purge_document_children('work_order_aborts', 'col', 'id');

-- ─── 2. 指示書: 打ち切った日時 ─────────────────────────────────────────────
ALTER TABLE "app"."work_orders" ADD COLUMN "aborted_at" TIMESTAMPTZ(6);

-- ─── 3. 入出庫伝票の事由 ───────────────────────────────────────────────────
ALTER TYPE "app"."INVENTORY_MOVEMENT_CAUSE" ADD VALUE IF NOT EXISTS 'WORK_ORDER_ABORT' AFTER 'WORK_ORDER_COMPLETION';

-- ─── 4. 承認フローの対象に「指示書の打ち切り」を足す ────────────────────────
ALTER TABLE "app"."approval_flows" DROP CONSTRAINT IF EXISTS "approval_flows_target_type_check";
ALTER TABLE "app"."approval_flows" ADD CONSTRAINT "approval_flows_target_type_check"
  CHECK (target_type = ANY (ARRAY[
    'work_orders'::text,
    'order_acceptances'::text,
    'material_purchase_orders'::text,
    'purchase_requests'::text,
    'work_order_flow_changes'::text,
    'order_acceptance_cancel_requests'::text,
    'form_responses'::text,
    'internal_pages'::text,
    'design_requests'::text,
    'delivery_orders'::text,
    'stock_takes'::text,
    'invoices'::text,
    'invoice_payments'::text,
    'design_versions'::text,
    'price_list_entries'::text,
    'work_order_aborts'::text
  ]));
