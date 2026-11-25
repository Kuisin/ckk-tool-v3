-- 仕掛品の再設計 第 5 段（PR 5/7）: 在庫の仕掛品から指示書を始める。
--
-- 第 4 段までで、仕掛品は 仕掛ブランク × 加工状態 のバケットに入り、在庫管理の
-- 仕掛品タブで「どの製品に使えるか」まで見えるようになった。この段で、指示書を
-- 作るときにその仕掛品を選び、済んでいる工程を飛ばして続きから作れるようにする。
--
--   work_orders.start_wip_state_id
--     開始状態 — 投入する仕掛品の加工状態。NULL = 素材から作る（従来どおり）。
--     入っていれば、その状態で済んでいる工程は指示書の工程に載っていない。
--   work_orders.wip_override_reason
--     加工状態が製品の工程の先頭部分になっていない仕掛品を、人の判断で使った理由。
--   work_order_wip_draws
--     投入する仕掛品（在庫バケット × 数量）。**予約ではない** — 予約は承認の
--     ときに inventory_reservations へ取り、完了のときにここのバケットから落とす。
--
-- ローリングデプロイ: 列（NULL 可・既定なし）と表を足すだけ。旧アプリは知らないので
-- 触らない。旧アプリが作る指示書は start_wip_state_id が NULL で、完了の計上は
-- 従来の経路（狙いのロット → 同じブランク → 同じ目標製品）のまま。

ALTER TABLE "app"."work_orders"
  ADD COLUMN "start_wip_state_id" INTEGER,
  ADD COLUMN "wip_override_reason" TEXT;

ALTER TABLE "app"."work_orders"
  ADD CONSTRAINT "work_orders_start_wip_state_id_fkey"
  FOREIGN KEY ("start_wip_state_id") REFERENCES "app"."wip_states"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 理由は「ある」か「無い」か — 空白だけの理由を残さない。
ALTER TABLE "app"."work_orders"
  ADD CONSTRAINT "work_orders_wip_override_reason_not_blank"
  CHECK ("wip_override_reason" IS NULL OR btrim("wip_override_reason") <> '');

-- 理由だけあって開始状態が無い、は起きない形（仕掛品を使わない指示書に理由は無い）。
ALTER TABLE "app"."work_orders"
  ADD CONSTRAINT "work_orders_wip_override_needs_start_state"
  CHECK ("wip_override_reason" IS NULL OR "start_wip_state_id" IS NOT NULL);

CREATE INDEX "work_orders_start_wip_state_id_idx" ON "app"."work_orders"("start_wip_state_id");

CREATE TABLE "app"."work_order_wip_draws" (
    "work_order_id" UUID NOT NULL,
    "inventory_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_wip_draws_pkey" PRIMARY KEY ("work_order_id","inventory_id")
);

CREATE INDEX "work_order_wip_draws_inventory_id_idx" ON "app"."work_order_wip_draws"("inventory_id");

ALTER TABLE "app"."work_order_wip_draws"
  ADD CONSTRAINT "work_order_wip_draws_work_order_id_fkey"
  FOREIGN KEY ("work_order_id") REFERENCES "app"."work_orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."work_order_wip_draws"
  ADD CONSTRAINT "work_order_wip_draws_inventory_id_fkey"
  FOREIGN KEY ("inventory_id") REFERENCES "app"."item_inventory"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."work_order_wip_draws"
  ADD CONSTRAINT "work_order_wip_draws_quantity_positive"
  CHECK ("quantity" > 0);
