-- 過不足納品（§8）— 受注数量ちょうどでなくても出荷できるようにする。
--
-- これまで出荷は受注数量が上限で（validateLineRemaining / 過出荷ガード）、
-- 下回る出荷は必ず「一部出荷」= 残りが後から出てくる前提だった。実際の製造では
-- 不良で 2 本足りない・端数で 3 本多いロットがそのまま納品される。その事実を
-- 表せる列が無かったので、現場は受注数量を書き換えるか、残数を永久に抱えていた。
--
-- 3 つの主体がそれぞれ別のことを決める:
--   指示書   allow_quantity_variance      このロットを過不足のまま出してよいか（生産の判断）
--   顧客     delivery_tolerance_*         どこまでのずれなら受け取るか（商流の約束）
--            variance_approval_*          ずれたとき決裁を挟むか（範囲の内 / 外で別々）
--   出荷書   closes_order_lines           この出荷で注文明細を締めるか（出荷時の判断）
--            billing_price_mode           請求単価を受注時のまま使うか実数で引き直すか
--
-- 判定を 1 か所に閉じるため、実際の可否・承認要否の計算は
-- coolify/apps/nextjs-web/src/lib/delivery-variance-core.ts が唯一の定義元。
-- DB 側は値の入れ物と、意味の無い値を弾く CHECK だけを持つ。

-- ─── 顧客: 許容幅と承認の要否 ────────────────────────────────────────────────
CREATE TYPE "app"."DELIVERY_TOLERANCE_BASIS" AS ENUM ('PERCENT', 'QUANTITY');

ALTER TABLE "app"."bp_customer_attrs"
  ADD COLUMN "delivery_tolerance_basis" "app"."DELIVERY_TOLERANCE_BASIS" NOT NULL DEFAULT 'PERCENT',
  ADD COLUMN "delivery_tolerance_under" DECIMAL(8,3),
  ADD COLUMN "delivery_tolerance_over" DECIMAL(8,3),
  ADD COLUMN "variance_approval_within" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "variance_approval_outside" BOOLEAN NOT NULL DEFAULT true;

-- 幅は「受注数量からどれだけ離れてよいか」なので負の数に意味が無い。
-- null = 未設定 = 0（その側の過不足を認めない）。
ALTER TABLE "app"."bp_customer_attrs"
  ADD CONSTRAINT "bp_customer_attrs_delivery_tolerance_nonneg"
  CHECK (
    ("delivery_tolerance_under" IS NULL OR "delivery_tolerance_under" >= 0)
    AND ("delivery_tolerance_over" IS NULL OR "delivery_tolerance_over" >= 0)
  );

-- % 基準の不足側は 100 を超えても意味が無い（受注数量より多く不足はできない）。
ALTER TABLE "app"."bp_customer_attrs"
  ADD CONSTRAINT "bp_customer_attrs_delivery_tolerance_under_percent"
  CHECK (
    "delivery_tolerance_basis" <> 'PERCENT'
    OR "delivery_tolerance_under" IS NULL
    OR "delivery_tolerance_under" <= 100
  );

-- ─── 指示書: このロットを過不足のまま出してよいか ────────────────────────────
ALTER TABLE "app"."work_orders"
  ADD COLUMN "allow_quantity_variance" BOOLEAN NOT NULL DEFAULT false;

-- ─── 出荷書: 締め・請求単価・承認 ────────────────────────────────────────────
CREATE TYPE "app"."DELIVERY_BILLING_PRICE_MODE" AS ENUM ('ORIGINAL', 'PRICE_LIST');
CREATE TYPE "app"."DELIVERY_ORDER_APPROVAL_STATUS" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "app"."delivery_orders"
  ADD COLUMN "billing_price_mode" "app"."DELIVERY_BILLING_PRICE_MODE" NOT NULL DEFAULT 'ORIGINAL',
  ADD COLUMN "closes_order_lines" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "approval_status" "app"."DELIVERY_ORDER_APPROVAL_STATUS" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "requested_at" TIMESTAMPTZ(6),
  ADD COLUMN "requested_by" UUID,
  ADD COLUMN "approved_at" TIMESTAMPTZ(6),
  ADD COLUMN "approved_by" UUID,
  ADD COLUMN "rejected_at" TIMESTAMPTZ(6),
  ADD COLUMN "rejected_by" UUID,
  ADD COLUMN "reject_reason" TEXT;

ALTER TABLE "app"."delivery_orders"
  ADD CONSTRAINT "delivery_orders_requested_by_fkey"
    FOREIGN KEY ("requested_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "delivery_orders_approved_by_fkey"
    FOREIGN KEY ("approved_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "delivery_orders_rejected_by_fkey"
    FOREIGN KEY ("rejected_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "delivery_orders_approval_status_idx"
  ON "app"."delivery_orders"("approval_status");

-- 請求単価のスナップショット。確定時に焼き込むので、そのあと価格表を直しても
-- 発行済みの納品書・請求書は動かない（invoices.tax_rate と同じ考え方）。
-- 既存行は null のまま = 注文明細の単価を読む従来の経路。
ALTER TABLE "app"."delivery_order_items"
  ADD COLUMN "unit_price" DECIMAL(12,2);

-- ─── 承認対象の追加 ──────────────────────────────────────────────────────────
-- 張り替えないと MS0B（承認設定）で出荷書のフローを作れない。
-- 前例: 20260910090100_design_request_approval/migration.sql
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
    'delivery_orders'::text
  ]));
