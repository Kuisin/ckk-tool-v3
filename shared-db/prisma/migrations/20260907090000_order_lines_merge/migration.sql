-- 受注明細（order_lines）統合 — 注文請書 sales_orders を受注請書明細に吸収する。
--
-- 背景: 1 本の受注ラインが order_acceptance_items（下書き）と sales_orders
-- （実行アンカー）に二重に存在し、同じ 7 フィールドを持ちながら乖離を防ぐ
-- 仕組みが無かった。統合して order_lines 1 本にし、指示書 / 出荷書 / 引当 /
-- 設計依頼 / 請求明細はすべてここに紐付く。
--
-- ★ このマイグレーションは冒頭で取引データを TRUNCATE する ★
--   backfill は行わない（ユーザー判断 — dev の取引データは検証用で保持価値が
--   無く、sortOrder↔branch の対応付けや親なし sales_orders の合成といった
--   複雑さをすべて回避するため）。列の追加・削除は空テーブル前提であり、
--   データが残っている状態では NOT NULL 化が失敗する。
--   マスタ（取引先 / 製品 / 材種 / 素材 / 拠点 / 工程 / 検査表 / ユーザー /
--   ロール / 採番）は削除しない。
--   適用前に必ず pg_dump を取ること（docker-compose/db-backup/README.md）。

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 取引データの削除（FK は CASCADE で辿る。マスタには触れない）
-- ─────────────────────────────────────────────────────────────────────────────
TRUNCATE TABLE
  "app"."order_acceptances",
  "app"."order_acceptance_items",
  "app"."sales_orders",
  "app"."work_orders",
  "app"."work_order_steps",
  "app"."work_order_step_plans",
  "app"."work_order_step_actuals",
  "app"."work_order_step_links",
  "app"."work_order_inspection_templates",
  "app"."inspection_records",
  "app"."inspection_record_items",
  "app"."defect_records",
  "app"."shipping_orders",
  "app"."shipping_order_items",
  "app"."delivery_notes",
  "app"."delivery_note_items",
  "app"."invoices",
  "app"."invoice_items",
  "app"."billing_closings",
  "app"."inventory_reservations",
  "app"."inventory_transactions",
  "app"."product_inventory",
  "app"."material_inventory",
  "app"."design_requests"
  RESTART IDENTITY CASCADE;

-- 削除した文書に紐付く付帯データ（メモ・添付・監査）も落とす
DELETE FROM "app"."document_memos"
 WHERE "owner_type" IN ('sales_orders', 'order_acceptances', 'work_orders',
                        'shipping_orders', 'delivery_notes', 'invoices');
-- memo_id は SetNull なのでメモを消しても改訂は残る。明示的に落とす。
DELETE FROM "app"."document_memo_revisions"
 WHERE "owner_type" IN ('sales_orders', 'order_acceptances', 'work_orders',
                        'shipping_orders', 'delivery_notes', 'invoices');
DELETE FROM "app"."document_attachments"
 WHERE "owner_type" IN ('sales_orders', 'order_acceptances', 'work_orders',
                        'shipping_orders', 'delivery_notes', 'invoices');
DELETE FROM "app"."audit_logs"
 WHERE "table_name" IN ('sales_orders', 'order_acceptances', 'order_acceptance_items',
                        'work_orders', 'shipping_orders', 'delivery_notes',
                        'invoices', 'billing_closings', 'design_requests');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. enum のリネーム（値は不変 — データ書き換え無し）
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE "app"."SALES_ORDER_STATUS" RENAME TO "ORDER_LINE_STATUS";

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. order_acceptance_items → order_lines（制約・インデックスも改名）
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "app"."order_acceptance_items" RENAME TO "order_lines";

ALTER TABLE "app"."order_lines"
  RENAME CONSTRAINT "order_acceptance_items_pkey" TO "order_lines_pkey";
ALTER TABLE "app"."order_lines"
  RENAME CONSTRAINT "order_acceptance_items_acceptance_year_month_acceptance_se_fkey"
                 TO "order_lines_acceptance_year_month_acceptance_seq_fkey";
ALTER TABLE "app"."order_lines"
  RENAME CONSTRAINT "order_acceptance_items_product_id_fkey" TO "order_lines_product_id_fkey";
ALTER INDEX "app"."order_acceptance_items_acceptance_year_month_acceptance_seq_idx"
  RENAME TO "order_lines_acceptance_year_month_acceptance_seq_idx";

-- 親削除の意味を変える: 下書き行なら CASCADE で良かったが、確定後の受注明細が
-- 受注請書ごと消えるのは許容できない。
ALTER TABLE "app"."order_lines"
  DROP CONSTRAINT "order_lines_acceptance_year_month_acceptance_seq_fkey";
ALTER TABLE "app"."order_lines"
  ADD CONSTRAINT "order_lines_acceptance_year_month_acceptance_seq_fkey"
  FOREIGN KEY ("acceptance_year_month", "acceptance_seq")
  REFERENCES "app"."order_acceptances"("year_month", "seq")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. order_lines に実行用の列を追加（旧 sales_orders 由来）
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "app"."order_lines"
  ADD COLUMN "branch"          INTEGER,
  ADD COLUMN "amount"          DECIMAL(12,2),
  ADD COLUMN "status"          "app"."ORDER_LINE_STATUS" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "lot_number"      INTEGER,
  ADD COLUMN "is_locked"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "end_user_bp_id"  UUID,
  ADD COLUMN "confirmed_at"    TIMESTAMPTZ(6),
  ADD COLUMN "cancelled_at"    TIMESTAMPTZ(6),
  ADD COLUMN "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "order_lines_lot_number_key" ON "app"."order_lines"("lot_number");
CREATE UNIQUE INDEX "order_lines_acceptance_year_month_acceptance_seq_branch_key"
  ON "app"."order_lines"("acceptance_year_month", "acceptance_seq", "branch");
CREATE INDEX "order_lines_status_idx"     ON "app"."order_lines"("status");
CREATE INDEX "order_lines_product_id_idx" ON "app"."order_lines"("product_id");

ALTER TABLE "app"."order_lines"
  ADD CONSTRAINT "order_lines_end_user_bp_id_fkey" FOREIGN KEY ("end_user_bp_id")
  REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 確定済み（DRAFT 以外）の行は公開番号と金額が揃っていなければならない。
-- Prisma は CHECK を introspect しないので migrate diff は汚れない。
ALTER TABLE "app"."order_lines" ADD CONSTRAINT "order_lines_confirmed_complete" CHECK (
  "status" = 'DRAFT'
  OR ("branch" IS NOT NULL AND "product_id" IS NOT NULL
      AND "unit_price" IS NOT NULL AND "amount" IS NOT NULL AND "confirmed_at" IS NOT NULL)
);

-- 受注明細の顧客絞り込みはヘッダ経由になる
CREATE INDEX "order_acceptances_customer_bp_id_idx"
  ON "app"."order_acceptances"("customer_bp_id");

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 子テーブルの FK を order_lines へ張り替え（空なので backfill 不要）
-- ─────────────────────────────────────────────────────────────────────────────

-- 指示書 — order_line_id は nullable のまま（null = 在庫向けの独立指示書）
ALTER TABLE "app"."work_orders" DROP CONSTRAINT "work_orders_sales_order_id_fkey";
DROP INDEX "app"."work_orders_sales_order_id_idx";
ALTER TABLE "app"."work_orders" RENAME COLUMN "sales_order_id" TO "order_line_id";
CREATE INDEX "work_orders_order_line_id_idx" ON "app"."work_orders"("order_line_id");
ALTER TABLE "app"."work_orders"
  ADD CONSTRAINT "work_orders_order_line_id_fkey" FOREIGN KEY ("order_line_id")
  REFERENCES "app"."order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 在庫引当
ALTER TABLE "app"."inventory_reservations"
  DROP CONSTRAINT "inventory_reservations_sales_order_id_fkey";
DROP INDEX "app"."inventory_reservations_sales_order_id_idx";
ALTER TABLE "app"."inventory_reservations" RENAME COLUMN "sales_order_id" TO "order_line_id";
CREATE INDEX "inventory_reservations_order_line_id_idx"
  ON "app"."inventory_reservations"("order_line_id");
ALTER TABLE "app"."inventory_reservations"
  ADD CONSTRAINT "inventory_reservations_order_line_id_fkey" FOREIGN KEY ("order_line_id")
  REFERENCES "app"."order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 設計依頼
ALTER TABLE "app"."design_requests" DROP CONSTRAINT "design_requests_sales_order_id_fkey";
ALTER TABLE "app"."design_requests" RENAME COLUMN "sales_order_id" TO "order_line_id";
ALTER TABLE "app"."design_requests"
  ADD CONSTRAINT "design_requests_order_line_id_fkey" FOREIGN KEY ("order_line_id")
  REFERENCES "app"."order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. 出荷書 — 受注明細リンクをヘッダから明細行へ移す
--    （1 出荷書に複数の受注明細を全量・部分数量で載せられるようにする）
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "app"."shipping_order_items" ADD COLUMN "order_line_id" UUID;
CREATE INDEX "shipping_order_items_order_line_id_idx"
  ON "app"."shipping_order_items"("order_line_id");
ALTER TABLE "app"."shipping_order_items"
  ADD CONSTRAINT "shipping_order_items_order_line_id_fkey" FOREIGN KEY ("order_line_id")
  REFERENCES "app"."order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ヘッダは顧客だけを持つ（請求の顧客判定・納品書の宛先導出がここを見る）
ALTER TABLE "app"."shipping_orders" DROP CONSTRAINT "shipping_orders_sales_order_id_fkey";
DROP INDEX "app"."shipping_orders_sales_order_id_idx";
ALTER TABLE "app"."shipping_orders" DROP COLUMN "sales_order_id";
ALTER TABLE "app"."shipping_orders"
  ADD COLUMN "customer_bp_id"        UUID NOT NULL,
  ADD COLUMN "customer_branch_bp_id" UUID;
CREATE INDEX "shipping_orders_customer_bp_id_idx"
  ON "app"."shipping_orders"("customer_bp_id");
ALTER TABLE "app"."shipping_orders"
  ADD CONSTRAINT "shipping_orders_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id")
  REFERENCES "app"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."shipping_orders"
  ADD CONSTRAINT "shipping_orders_customer_branch_bp_id_fkey" FOREIGN KEY ("customer_branch_bp_id")
  REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. 請求明細 — 1 出荷書が複数明細を束ねるため、単価の出所を行で持つ
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "app"."invoice_items" ADD COLUMN "order_line_id" UUID;
CREATE INDEX "invoice_items_order_line_id_idx" ON "app"."invoice_items"("order_line_id");
ALTER TABLE "app"."invoice_items"
  ADD CONSTRAINT "invoice_items_order_line_id_fkey" FOREIGN KEY ("order_line_id")
  REFERENCES "app"."order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. sales_orders の削除
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE "app"."sales_orders";

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. 文字列キーの参照を追随（TRUNCATE 後の残存分に対する保険）
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "app"."audit_logs"             SET "table_name" = 'order_lines' WHERE "table_name" = 'sales_orders';
UPDATE "app"."document_memos"          SET "owner_type" = 'order_lines' WHERE "owner_type" = 'sales_orders';
UPDATE "app"."document_memo_revisions" SET "owner_type" = 'order_lines' WHERE "owner_type" = 'sales_orders';
UPDATE "app"."document_attachments"    SET "owner_type" = 'order_lines' WHERE "owner_type" = 'sales_orders';
UPDATE "app"."inventory_transactions" SET "reference_type" = 'order_line' WHERE "reference_type" = 'sales_order';

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RBAC — 受注明細は order_acceptance 権限に統一する
--     work_order を持つ全ロールへ同じ action / scope で order_acceptance を複写。
--     （複写しないと既存ユーザーが受注明細を一切見られなくなる）
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "app"."role_permission_relation" ("role_id", "permission_code", "action", "scope", "scope_values")
SELECT rpr."role_id", 'order_acceptance', rpr."action", rpr."scope", rpr."scope_values"
  FROM "app"."role_permission_relation" rpr
 WHERE rpr."permission_code" = 'work_order'
   AND NOT EXISTS (
         SELECT 1 FROM "app"."role_permission_relation" x
          WHERE x."role_id" = rpr."role_id"
            AND x."permission_code" = 'order_acceptance'
            AND x."action" = rpr."action")
ON CONFLICT DO NOTHING;

UPDATE "app"."permissions"
   SET "display_name" = '{"ja":"指示書","en":"Work order"}'::jsonb
 WHERE "code" = 'work_order';
UPDATE "app"."permissions"
   SET "display_name" = '{"ja":"受注請書・受注明細","en":"Order acceptance"}'::jsonb
 WHERE "code" = 'order_acceptance';
