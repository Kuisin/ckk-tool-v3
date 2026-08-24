-- 注文請書キャンセルの承認（§2 / §6）。
--
-- 確定済み（COMPLETED）の注文請書は**明細単位ではキャンセルできない**ように
-- 変わる（アプリ側で per 注文明細のキャンセル操作を廃止）。代わりに
-- 注文請書ごとキャンセルを依頼し、承認設定（MS0B）の「注文請書キャンセル」
-- フローを通す。1 段も無ければ素通し（即適用）— 工程フロー変更と同じ規約。
--
-- 承認は**キャンセルを止める**: 依頼時点では何も変更せず、この表に保留して
-- 最終承認で初めて適用する（全明細のキャンセル + 予約解放 + 未着手指示書の
-- 連鎖キャンセル + ヘッダ CANCELLED）。差し戻しなら何も変わらない。
-- 承認待ちの間に出荷された等で適用できなければ FAILED として残る。

-- 1) 注文請書ステータスに CANCELLED を追加（適用後のヘッダ状態）。
ALTER TYPE "app"."ORDER_ACCEPTANCE_STATUS" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- 2) approval_flows に種別を足す（CHECK の作り直し + 行の投入）。
--    行が無いと承認設定（MS0B）の画面に「注文請書キャンセル」が出てこない。
ALTER TABLE "app"."approval_flows"
  DROP CONSTRAINT IF EXISTS "approval_flows_target_type_check";

ALTER TABLE "app"."approval_flows"
  ADD CONSTRAINT "approval_flows_target_type_check" CHECK ("target_type" IN (
    'work_orders',
    'order_acceptances',
    'material_purchase_orders',
    'purchase_requests',
    'work_order_flow_changes',
    'order_acceptance_cancel_requests'
  ));

INSERT INTO "app"."approval_flows" ("target_type", "updated_at")
VALUES ('order_acceptance_cancel_requests', now())
ON CONFLICT ("target_type") DO NOTHING;

-- 3) 保留中のキャンセル依頼を持つ表。
CREATE TABLE "app"."order_acceptance_cancel_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "acceptance_year_month" CHAR(6) NOT NULL,
    "acceptance_seq" INTEGER NOT NULL,
    -- 依頼理由（必須 — 確定済みの受注を取り消す例外操作のため）。
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    -- 適用に失敗した理由（承認待ちの間に出荷された等）。承認後に出る。
    "error" TEXT,
    "requested_by" UUID,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "order_acceptance_cancel_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_acceptance_cancel_requests_status_check"
      CHECK ("status" IN ('PENDING', 'APPLIED', 'REJECTED', 'CANCELLED', 'FAILED'))
);

ALTER TABLE "app"."order_acceptance_cancel_requests"
  ADD CONSTRAINT "order_acceptance_cancel_requests_acceptance_year_month_acc_fkey"
  FOREIGN KEY ("acceptance_year_month", "acceptance_seq")
  REFERENCES "app"."order_acceptances"("year_month", "seq")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."order_acceptance_cancel_requests"
  ADD CONSTRAINT "order_acceptance_cancel_requests_requested_by_fkey"
  FOREIGN KEY ("requested_by") REFERENCES "app"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."order_acceptance_cancel_requests"
  ADD CONSTRAINT "order_acceptance_cancel_requests_resolved_by_fkey"
  FOREIGN KEY ("resolved_by") REFERENCES "app"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "order_acceptance_cancel_requests_acceptance_year_month_acce_idx"
  ON "app"."order_acceptance_cancel_requests" ("acceptance_year_month", "acceptance_seq", "status");

-- 進行中の依頼は 1 注文請書に 1 件だけ。
CREATE UNIQUE INDEX "order_acceptance_cancel_requests_one_pending"
  ON "app"."order_acceptance_cancel_requests" ("acceptance_year_month", "acceptance_seq")
  WHERE "status" = 'PENDING';

-- 書類テーブルの規約: 業務キーで紐づく子行（承認依頼）を AFTER DELETE で掃除。
-- id 列そのものが業務キーなので mode='col', arg='id'。
CREATE TRIGGER "purge_children_after_delete"
  AFTER DELETE ON "app"."order_acceptance_cancel_requests"
  FOR EACH ROW
  EXECUTE FUNCTION app.purge_document_children('order_acceptance_cancel_requests', 'col', 'id');

COMMENT ON TABLE "app"."order_acceptance_cancel_requests" IS
  '承認されるまで適用しない注文請書キャンセル依頼。承認設定が未設定なら作られず即適用される。';
