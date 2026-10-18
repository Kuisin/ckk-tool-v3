-- allow-destructive: approval_flows_target_type_check は張り直すだけで値の集合は広がる（旧アプリは price_list_entries を書かない）
-- 独自値の追加承認（承認設定 MS0B）
--
-- 書類に「前の書類から引き継いでいない値」があるときだけ、通常の承認フローの
-- 後ろに足す段を、書類種別ごとに別建てで持つ。最初に判定を持つのは
-- 価格表（price_list_entries）と注文請書（order_acceptances）。
--
-- ローリングデプロイ:
--   * 新しい表・列・型は足すだけ（既定値 NONE）。旧アプリは知らないので触らない。
--   * approval_flows_target_type_check は値の集合を広げるだけ。旧アプリは
--     'price_list_entries' を書かない。前例: 20261110090000_design_versions。
--   * 段が 1 本も無いあいだは何も変わらない（未設定 = 素通し）。

-- ─── 1. 承認フローの対象に価格表を足す ────────────────────────────────────────
-- 価格表は既定フローを持たない（MS0B に出さない）。approval_flows の行は
-- 独自値の段（approval_custom_value_steps.target_type の FK 先）のためだけに要る。
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
    'price_list_entries'::text
  ]));

-- ─── 2. 独自値の追加承認の段 ────────────────────────────────────────────────
CREATE TABLE "app"."approval_custom_value_steps" (
    "id" SERIAL NOT NULL,
    "target_type" TEXT NOT NULL,
    "step_no" INTEGER NOT NULL,
    "name" JSONB NOT NULL,
    "group_id" INTEGER NOT NULL,
    "mode" "app"."APPROVAL_MODE" NOT NULL DEFAULT 'ANY',

    CONSTRAINT "approval_custom_value_steps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_custom_value_steps_step_no_check" CHECK ("step_no" >= 1)
);

CREATE UNIQUE INDEX "approval_custom_value_steps_target_type_step_no_key"
  ON "app"."approval_custom_value_steps"("target_type", "step_no");
CREATE INDEX "approval_custom_value_steps_group_id_idx"
  ON "app"."approval_custom_value_steps"("group_id");

ALTER TABLE "app"."approval_custom_value_steps"
  ADD CONSTRAINT "approval_custom_value_steps_target_type_fkey"
  FOREIGN KEY ("target_type") REFERENCES "app"."approval_flows"("target_type")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."approval_custom_value_steps"
  ADD CONSTRAINT "approval_custom_value_steps_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "app"."approval_groups"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 3. 価格表の承認状態 ────────────────────────────────────────────────────
CREATE TYPE "app"."PRICE_LIST_APPROVAL_STATUS" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "app"."price_list_entries"
  ADD COLUMN "approval_status" "app"."PRICE_LIST_APPROVAL_STATUS" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "custom_value_signature" TEXT;
