-- allow-destructive: 落とすのは 2 本だけで、どちらも同じマイグレーションの中で
--   広げた版を張り直している（値の集合・行の許される形は広がるだけ・狭まらない）:
--     1. approval_flows_target_type_check — 'invoices' / 'invoice_payments' を足す。
--     2. billing_closings_customer_bp_id_closing_date_key — SCHEDULED 行だけの
--        部分 unique に絞る（MANUAL 行は対象外になるだけで、既存の SCHEDULED 行
--        同士の一意性は変わらない）。
--   旧アプリはどちらにも触れないので、どちらが先に着いても壊れない。
--   前例: 20261014090000_delivery_quantity_variance / 20260910090100_design_request_approval。
--   それ以外の DDL はすべて列・型・索引の追加。

-- 請求フローの更新（§9）—
--   1. 締日処理の実行区分（定期 / 手動）。手動請求（BL11、納品書を選んで作る
--      臨時請求）は締日を待たないので、同じ顧客・同じ日に何度でも起こせる —
--      定期の締めが持つ「顧客×締日で 1 行」の一意性から外す。
--   2. 請求書の承認（発行前承認・入金前承認）。delivery_orders と同じ形。
--      2 つの関門は同時に開かない（発行承認は DRAFT、入金承認は SENT のときだけ）
--      ので、列は 1 組だけでよい。
--   3. 下書きへの追加費用（料金マスタ MS0G からだけ）。出荷書由来の追加料金
--      （送料など）と区別するため、invoice_items に料金項目の由来を持たせる。

-- ─── 締日処理: 実行区分 ──────────────────────────────────────────────────────
CREATE TYPE "app"."CLOSING_KIND" AS ENUM ('SCHEDULED', 'MANUAL');

ALTER TABLE "app"."billing_closings"
  ADD COLUMN "kind" "app"."CLOSING_KIND" NOT NULL DEFAULT 'SCHEDULED';

-- 既存の unique index を「SCHEDULED 行だけ」の部分 unique index に絞る。
-- 定期の締めは 1 顧客 1 締日で冪等のまま。手動請求 (MANUAL) は同じ顧客・
-- 同じ日に何本でも作れる（Prisma スキーマ側は @@unique を外し @@index にした
-- — 部分 unique は Prisma で表現できないため、ここに直書きする）。
DROP INDEX IF EXISTS "app"."billing_closings_customer_bp_id_closing_date_key";
CREATE UNIQUE INDEX "billing_closings_scheduled_key"
  ON "app"."billing_closings" ("customer_bp_id", "closing_date")
  WHERE ("kind" = 'SCHEDULED');
-- 手動請求の一覧・突合用（部分 unique と重複しない全行対象の索引）。
CREATE INDEX "billing_closings_customer_bp_id_closing_date_idx"
  ON "app"."billing_closings" ("customer_bp_id", "closing_date");

-- ─── 請求書: 承認（発行前承認・入金前承認） ──────────────────────────────────
CREATE TYPE "app"."INVOICE_APPROVAL_STATUS" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "app"."invoices"
  ADD COLUMN "closing_kind" "app"."CLOSING_KIND",
  ADD COLUMN "approval_status" "app"."INVOICE_APPROVAL_STATUS" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "requested_at" TIMESTAMPTZ(6),
  ADD COLUMN "requested_by" UUID,
  ADD COLUMN "approved_at" TIMESTAMPTZ(6),
  ADD COLUMN "approved_by" UUID,
  ADD COLUMN "rejected_at" TIMESTAMPTZ(6),
  ADD COLUMN "rejected_by" UUID,
  ADD COLUMN "reject_reason" TEXT;

ALTER TABLE "app"."invoices"
  ADD CONSTRAINT "invoices_requested_by_fkey"
    FOREIGN KEY ("requested_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "invoices_approved_by_fkey"
    FOREIGN KEY ("approved_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "invoices_rejected_by_fkey"
    FOREIGN KEY ("rejected_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "invoices_approval_status_idx"
  ON "app"."invoices"("approval_status");

-- ─── 請求明細: 追加費用（料金マスタ）の由来 ──────────────────────────────────
-- 出荷書・納品書の由来列は既に nullable（明細 2 本以上の出荷書が請求できない
-- 既知の不具合 #871 は本マイグレーションの対象外・別issueで直す）。
-- 手動で足した費用 = delivery_order_year_month IS NULL かつ charge_item_id が
-- 入っている行（lib/invoice-charges.ts hasManualCharge が唯一の判定元）。
ALTER TABLE "app"."invoice_items"
  ADD COLUMN "charge_item_id" INTEGER;

ALTER TABLE "app"."invoice_items"
  ADD CONSTRAINT "invoice_items_charge_item_id_fkey"
    FOREIGN KEY ("charge_item_id") REFERENCES "app"."charge_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "invoice_items_charge_item_id_idx"
  ON "app"."invoice_items"("charge_item_id");

-- ─── 承認対象の追加 ──────────────────────────────────────────────────────────
-- invoices = 追加費用ありの請求書の発行前承認。
-- invoice_payments = 支払い済みにする前の入金前承認（対象は請求書と同じ行、
-- targetId は請求書番号のまま — 操作ごとに種別を分けるのは work_orders /
-- work_order_flow_changes と同じ規約）。
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
    'invoice_payments'::text
  ]));
