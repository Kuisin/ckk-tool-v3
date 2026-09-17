-- 入出庫伝票（inventory_movements）と棚卸（stock_takes）。
--
-- これまで在庫の増減は inventory_transactions の行だけで、手掛かりは
-- (reference_type, reference_id) の 2 列しか無かった。しかもその reference_id は
-- 経路ごとに形が違う — 指示書は uuid、出荷書は表示番号 "DOR-…"、在庫移動に
-- 至ってはその場で作った randomUUID を 2 行に書くだけでどこにも保存していない。
-- 結果として「MOV-… を見せて」と言えず、1 回の移動が 1 行として読めない。
--
-- ここで伝票（ヘッダ）を足し、取引行をその明細にする。伝票は**在庫の増減と同じ
-- トランザクションで**作られる（アプリ側 lib/inventory.ts が強制する）。
--
-- **movement_id はこの migration では NOT NULL にしない。** アプリとマイグレータは
-- 同じ merge から別々に走り、どちらが先に着くか決められない（scripts/
-- check-migration-compat.sh の趣旨）。ここで NOT NULL にすると、まだ動いている
-- 旧バージョンのアプリの在庫計上が全部落ちる。NOT NULL は「このデプロイが行き渡って
-- から」の別マイグレーションで当てる。
--
-- 既存行には下で伝票を後付けする（cause = 推定、付けられないものは OTHER）。

-- CreateEnum
CREATE TYPE "app"."INVENTORY_MOVEMENT_CAUSE" AS ENUM ('WORK_ORDER_COMPLETION', 'DELIVERY_SHIPMENT', 'MATERIAL_RECEIPT', 'STOCK_TRANSFER', 'STOCK_RESERVATION', 'RESERVATION_RELEASE', 'ADJUSTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "app"."STOCK_TAKE_STATUS" AS ENUM ('DRAFT', 'COUNTING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "app"."STOCK_TAKE_APPROVAL_STATUS" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "app"."inventory_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "year_month" CHAR(6) NOT NULL,
    "seq" INTEGER NOT NULL,
    "cause" "app"."INVENTORY_MOVEMENT_CAUSE" NOT NULL,
    "source_type" TEXT,
    "source_id" TEXT,
    "plant_id" INTEGER,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "app"."inventory_transactions" ADD COLUMN "movement_id" UUID;

-- CreateTable
CREATE TABLE "app"."stock_takes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "year_month" CHAR(6) NOT NULL,
    "seq" INTEGER NOT NULL,
    "plant_id" INTEGER NOT NULL,
    "storage_location_id" INTEGER,
    "status" "app"."STOCK_TAKE_STATUS" NOT NULL DEFAULT 'DRAFT',
    "approval_status" "app"."STOCK_TAKE_APPROVAL_STATUS" NOT NULL DEFAULT 'NONE',
    "counted_at" TIMESTAMPTZ(6),
    "requested_at" TIMESTAMPTZ(6),
    "requested_by" UUID,
    "rejected_at" TIMESTAMPTZ(6),
    "rejected_by" UUID,
    "reject_reason" TEXT,
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmed_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by" UUID,
    "movement_id" UUID,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_takes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."stock_take_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stock_take_id" UUID NOT NULL,
    "inventory_type" "app"."INVENTORY_TYPE" NOT NULL,
    "inventory_id" UUID NOT NULL,
    "book_quantity" DECIMAL(12,3) NOT NULL,
    "counted_quantity" DECIMAL(12,3),
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stock_take_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_year_month_seq_key" ON "app"."inventory_movements"("year_month", "seq");

-- CreateIndex
CREATE INDEX "inventory_movements_created_at_id_idx" ON "app"."inventory_movements"("created_at", "id");

-- CreateIndex
CREATE INDEX "inventory_movements_source_type_source_id_idx" ON "app"."inventory_movements"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "inventory_movements_cause_created_at_idx" ON "app"."inventory_movements"("cause", "created_at");

-- CreateIndex
CREATE INDEX "inventory_transactions_movement_id_idx" ON "app"."inventory_transactions"("movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_takes_year_month_seq_key" ON "app"."stock_takes"("year_month", "seq");

-- CreateIndex
CREATE INDEX "stock_takes_status_idx" ON "app"."stock_takes"("status");

-- CreateIndex
CREATE INDEX "stock_takes_plant_id_idx" ON "app"."stock_takes"("plant_id");

-- CreateIndex
CREATE INDEX "stock_takes_updated_at_id_idx" ON "app"."stock_takes"("updated_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_take_lines_stock_take_id_inventory_type_inventory_id_key" ON "app"."stock_take_lines"("stock_take_id", "inventory_type", "inventory_id");

-- CreateIndex
CREATE INDEX "stock_take_lines_stock_take_id_idx" ON "app"."stock_take_lines"("stock_take_id");

-- AddForeignKey
ALTER TABLE "app"."inventory_movements" ADD CONSTRAINT "inventory_movements_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "app"."plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."inventory_transactions" ADD CONSTRAINT "inventory_transactions_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "app"."inventory_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."stock_takes" ADD CONSTRAINT "stock_takes_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "app"."plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."stock_takes" ADD CONSTRAINT "stock_takes_storage_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "app"."storage_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."stock_take_lines" ADD CONSTRAINT "stock_take_lines_stock_take_id_fkey" FOREIGN KEY ("stock_take_id") REFERENCES "app"."stock_takes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 既存の取引行に伝票を後付けする ─────────────────────────────────────────
--
-- まとめる鍵は (reference_type, reference_id, created_by, created_at)。
-- created_at の既定は now() = transaction_timestamp() なので、**同じ
-- トランザクションで書かれた行は created_at が完全に一致する** — つまりこの鍵は
-- 「1 回の出来事」をそのまま言い当てる。ミリ秒が衝突しても起きるのは無関係な
-- 2 件が 1 枚に混ざることだけで、行が失われることはない。
--
-- cause は reference_type から推定する。推定できない行（reference_type が null で
-- ADJUST でもない）は OTHER — 何の出来事だったかを当時記録していなかったのだから、
-- 埋めずに「不明」と言うほうが正直。
CREATE TEMPORARY TABLE _movement_backfill AS
WITH grp AS (
  SELECT
    reference_type,
    reference_id,
    created_by,
    created_at,
    bool_and(transaction_type = 'RELEASE') AS only_release,
    bool_and(transaction_type = 'RESERVE') AS only_reserve,
    bool_and(transaction_type = 'ADJUST')  AS only_adjust
  FROM "app"."inventory_transactions"
  WHERE movement_id IS NULL
  GROUP BY reference_type, reference_id, created_by, created_at
)
SELECT
  gen_random_uuid() AS movement_id,
  to_char(created_at AT TIME ZONE 'Asia/Tokyo', 'YYYYMM') AS year_month,
  (row_number() OVER (
    PARTITION BY to_char(created_at AT TIME ZONE 'Asia/Tokyo', 'YYYYMM')
    ORDER BY created_at,
             reference_type NULLS FIRST,
             reference_id NULLS FIRST,
             created_by NULLS FIRST
  ))::int AS seq,
  (CASE
    WHEN reference_type = 'stock_transfer'   THEN 'STOCK_TRANSFER'
    WHEN reference_type = 'material_receipt' THEN 'MATERIAL_RECEIPT'
    WHEN reference_type = 'delivery_order'   THEN 'DELIVERY_SHIPMENT'
    WHEN reference_type = 'order_line'  AND only_release THEN 'RESERVATION_RELEASE'
    WHEN reference_type = 'order_line'                   THEN 'STOCK_RESERVATION'
    WHEN reference_type = 'work_order'  AND only_reserve THEN 'STOCK_RESERVATION'
    WHEN reference_type = 'work_order'  AND only_release THEN 'RESERVATION_RELEASE'
    WHEN reference_type = 'work_order'                   THEN 'WORK_ORDER_COMPLETION'
    WHEN only_adjust THEN 'ADJUSTMENT'
    ELSE 'OTHER'
  END)::"app"."INVENTORY_MOVEMENT_CAUSE" AS cause,
  -- 新しい source_type はテーブル名（audit と同じ多態規約）。旧 reference_type は
  -- 単数形の別語彙だったので、ここで寄せる。在庫移動は書類ではないので null。
  (CASE reference_type
    WHEN 'work_order'       THEN 'work_orders'
    WHEN 'delivery_order'   THEN 'delivery_orders'
    WHEN 'material_receipt' THEN 'material_receipts'
    WHEN 'order_line'       THEN 'order_lines'
    ELSE NULL
  END) AS source_type,
  reference_type,
  reference_id,
  created_by,
  created_at
FROM grp;

INSERT INTO "app"."inventory_movements"
  ("id", "year_month", "seq", "cause", "source_type", "source_id", "plant_id", "notes", "created_by", "created_at")
SELECT
  movement_id, year_month, seq, cause, source_type, reference_id,
  NULL,  -- 拠点は行ごとのバケットからしか辿れず、1 枚が複数拠点にまたがり得るので推定しない
  NULL,
  created_by,
  created_at
FROM _movement_backfill;

UPDATE "app"."inventory_transactions" t
SET movement_id = b.movement_id
FROM _movement_backfill b
WHERE t.movement_id IS NULL
  AND t.created_at = b.created_at
  AND t.created_by     IS NOT DISTINCT FROM b.created_by
  AND t.reference_type IS NOT DISTINCT FROM b.reference_type
  AND t.reference_id   IS NOT DISTINCT FROM b.reference_id;

-- 採番を後付け分の続きから始める。当月ぶんが無ければ何もしない（アプリ側の
-- upsert が自分で行を作る）。
INSERT INTO "app"."numbering_sequences" ("key", "prefix", "last_year_month", "last_sequence", "updated_at")
SELECT 'INVENTORY_MOVEMENT', 'MOV', s.ym, s.mx, now()
FROM (
  SELECT year_month AS ym, max(seq) AS mx
  FROM _movement_backfill
  WHERE year_month = to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYYMM')
  GROUP BY year_month
) s
ON CONFLICT ("key") DO UPDATE SET
  "last_year_month" = EXCLUDED."last_year_month",
  "last_sequence"   = GREATEST("numbering_sequences"."last_sequence", EXCLUDED."last_sequence"),
  "updated_at"      = now();

DROP TABLE _movement_backfill;

-- ─── 棚卸を承認対象に加える ─────────────────────────────────────────────────
-- 張り替えないと 承認設定 (MS0B) で棚卸のフローを作れない。
-- 段が 1 つも無ければ素通し（工程フロー変更と同じ規約）。
-- 前例: 20261014090000_delivery_quantity_variance/migration.sql
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
    'stock_takes'::text
  ]));

-- ─── 多態の子（承認依頼・メモ・添付）の後始末 ───────────────────────────────
-- 棚卸は承認依頼を持つので、行を消したときに approval_requests が孤児にならない
-- ようにする。多態参照は FK ではないのでトリガーでしか守れない。
-- 入出庫伝票は子を持たない（承認もメモも添付も無い）ので付けない。
CREATE TRIGGER purge_children_after_delete
  AFTER DELETE ON "app"."stock_takes"
  FOR EACH ROW EXECUTE FUNCTION "app".purge_document_children('stock_takes', 'doc', 'STK');
