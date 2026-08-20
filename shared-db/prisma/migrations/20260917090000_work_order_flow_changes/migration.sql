-- 工程フロー変更の承認（§6 / §7）。
--
-- 承認済み・進行中の指示書で工程の分岐を足す/直す/消すのは、現場の段取りを
-- 変える行為なので承認を通せるようにする。ただし**承認設定（MS0B）で
-- 「工程フロー変更」のフローが 1 段も設定されていなければ素通し**にする —
-- 承認を運用しない拠点・立ち上げ期に、承認待ちで現場が止まらないようにする。
--
-- 承認は**変更を止める**（先に当てて後から承認、ではない）。依頼の時点では
-- 工程を触らず、やろうとした操作をこの表に保留しておき、最終承認で初めて
-- 適用する。差し戻し・取消なら適用せずに終わる。
--
-- 1) approval_flows に種別を足す（CHECK の作り直し + 行の投入）。
--    行が無いと承認設定の画面に「工程フロー変更」が出てこない。
-- 2) 保留中の変更を持つ表を作る。approval_requests は業務キー文字列
--    （= この表の id）で指すので FK は張れない → 書類テーブルの規約どおり
--    AFTER DELETE トリガーで承認依頼を掃除する。

ALTER TABLE "app"."approval_flows"
  DROP CONSTRAINT IF EXISTS "approval_flows_target_type_check";

ALTER TABLE "app"."approval_flows"
  ADD CONSTRAINT "approval_flows_target_type_check" CHECK ("target_type" IN (
    'work_orders',
    'order_acceptances',
    'material_purchase_orders',
    'purchase_requests',
    'work_order_flow_changes'
  ));

INSERT INTO "app"."approval_flows" ("target_type", "updated_at")
VALUES ('work_order_flow_changes', now())
ON CONFLICT ("target_type") DO NOTHING;

CREATE TABLE "app"."work_order_flow_changes" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_order_id" UUID NOT NULL,
  -- 何をしようとしたか。payload はその操作の入力そのもの（適用時に再検証する）。
  "kind"          TEXT NOT NULL,
  "payload"       JSONB NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'PENDING',
  -- 適用に失敗したとき（数量が足りなくなった等）の理由。承認後に出る。
  "error"         TEXT,
  "requested_by"  UUID,
  "requested_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "resolved_by"   UUID,
  "resolved_at"   TIMESTAMPTZ(6),

  CONSTRAINT "work_order_flow_changes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_order_flow_changes_kind_check"
    CHECK ("kind" IN ('ADD_BRANCH', 'UPDATE_BRANCH', 'REMOVE_BRANCH')),
  CONSTRAINT "work_order_flow_changes_status_check"
    CHECK ("status" IN ('PENDING', 'APPLIED', 'REJECTED', 'CANCELLED', 'FAILED'))
);

ALTER TABLE "app"."work_order_flow_changes"
  ADD CONSTRAINT "work_order_flow_changes_work_order_id_fkey"
  FOREIGN KEY ("work_order_id") REFERENCES "app"."work_orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."work_order_flow_changes"
  ADD CONSTRAINT "work_order_flow_changes_requested_by_fkey"
  FOREIGN KEY ("requested_by") REFERENCES "app"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."work_order_flow_changes"
  ADD CONSTRAINT "work_order_flow_changes_resolved_by_fkey"
  FOREIGN KEY ("resolved_by") REFERENCES "app"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "work_order_flow_changes_work_order_id_status_idx"
  ON "app"."work_order_flow_changes" ("work_order_id", "status");

-- 進行中の変更は 1 指示書に 1 件だけ（承認待ちが並ぶと適用順で結果が変わる）。
CREATE UNIQUE INDEX "work_order_flow_changes_one_pending"
  ON "app"."work_order_flow_changes" ("work_order_id")
  WHERE "status" = 'PENDING';

-- 書類テーブルの規約: 業務キーで紐づく子行（承認依頼）を AFTER DELETE で掃除。
-- id 列そのものが業務キーなので mode='col', arg='id'。
CREATE TRIGGER "purge_children_after_delete"
  AFTER DELETE ON "app"."work_order_flow_changes"
  FOR EACH ROW
  EXECUTE FUNCTION app.purge_document_children('work_order_flow_changes', 'col', 'id');

COMMENT ON TABLE "app"."work_order_flow_changes" IS
  '承認されるまで適用しない工程フロー変更（分岐の追加/更新/削除）。承認設定が未設定なら作られず即適用される。';
