-- 出荷書の英語名を shipping order → delivery order（DO）へ全面リネームする。
--
--   * テーブル: shipping_orders → delivery_orders /
--               shipping_order_items → delivery_order_items
--   * 参照列:   delivery_notes.shipping_order_* → delivery_order_* /
--               invoice_items.shipping_order_* → delivery_order_*
--   * enum:     SHIPPING_TYPE → DELIVERY_ORDER_TYPE /
--               SHIPPING_STATUS → DELIVERY_ORDER_STATUS（値は不変）
--   * 表示番号: SHP-YYYYMM-NNNNN → DOR-YYYYMM-NNNNN（番号は導出のため、
--               文字列で持つ参照データだけ書き換える）
--   * 権限コード: shipping_order → delivery_order（FK は ON UPDATE CASCADE）
--   * 営業担当: shipping_orders.sales_rep_id を **廃止** — 出荷書は明細の
--               注文明細 → 注文請書ヘッダの担当を読む（order_lines と同じ規約）
--
-- 日本語の呼称「出荷書」は変えない（UI ラベル・権限表示名の ja は据え置き）。
-- 制約・インデックス名は Prisma の規約名へ合わせて RENAME する（migrate dev の
-- ドリフト検出を黙らせるため）。

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. 依存ビューを先に落とす（sales_rep_id 削除が阻まれるため）。
--    analytics ビューは shared-db/sql/analytics-views.sql が正 — 適用後に
--    同ファイルを再実行して v_delivery_orders / v_delivery_order_items を作る。
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS analytics.v_shipping_orders;
DROP VIEW IF EXISTS analytics.v_shipping_order_items;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. enum リネーム（値は不変 — データ書き換え無し）
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE "app"."SHIPPING_TYPE" RENAME TO "DELIVERY_ORDER_TYPE";
ALTER TYPE "app"."SHIPPING_STATUS" RENAME TO "DELIVERY_ORDER_STATUS";

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. shipping_orders → delivery_orders（制約・インデックスも改名）
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "app"."shipping_orders" RENAME TO "delivery_orders";

ALTER TABLE "app"."delivery_orders"
  RENAME CONSTRAINT "shipping_orders_pkey" TO "delivery_orders_pkey";
ALTER TABLE "app"."delivery_orders"
  RENAME CONSTRAINT "shipping_orders_customer_bp_id_fkey" TO "delivery_orders_customer_bp_id_fkey";
ALTER TABLE "app"."delivery_orders"
  RENAME CONSTRAINT "shipping_orders_customer_branch_bp_id_fkey" TO "delivery_orders_customer_branch_bp_id_fkey";
ALTER TABLE "app"."delivery_orders"
  RENAME CONSTRAINT "shipping_orders_work_order_id_fkey" TO "delivery_orders_work_order_id_fkey";
ALTER TABLE "app"."delivery_orders"
  RENAME CONSTRAINT "shipping_orders_from_plant_id_fkey" TO "delivery_orders_from_plant_id_fkey";
ALTER TABLE "app"."delivery_orders"
  RENAME CONSTRAINT "shipping_orders_created_by_fkey" TO "delivery_orders_created_by_fkey";

ALTER INDEX "app"."shipping_orders_customer_bp_id_idx" RENAME TO "delivery_orders_customer_bp_id_idx";
ALTER INDEX "app"."shipping_orders_status_idx" RENAME TO "delivery_orders_status_idx";

-- 営業担当スナップショット列の廃止（明細 → 注文請書ヘッダから導出する）
ALTER TABLE "app"."delivery_orders" DROP CONSTRAINT "shipping_orders_sales_rep_id_fkey";
ALTER TABLE "app"."delivery_orders" DROP COLUMN "sales_rep_id";

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. shipping_order_items → delivery_order_items
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "app"."shipping_order_items" RENAME TO "delivery_order_items";

ALTER TABLE "app"."delivery_order_items"
  RENAME COLUMN "shipping_order_year_month" TO "delivery_order_year_month";
ALTER TABLE "app"."delivery_order_items"
  RENAME COLUMN "shipping_order_seq" TO "delivery_order_seq";

ALTER TABLE "app"."delivery_order_items"
  RENAME CONSTRAINT "shipping_order_items_pkey" TO "delivery_order_items_pkey";
ALTER TABLE "app"."delivery_order_items"
  RENAME CONSTRAINT "shipping_order_items_shipping_order_year_month_shipping_or_fkey"
               TO "delivery_order_items_delivery_order_year_month_delivery_or_fkey";
ALTER TABLE "app"."delivery_order_items"
  RENAME CONSTRAINT "shipping_order_items_product_id_fkey" TO "delivery_order_items_product_id_fkey";
ALTER TABLE "app"."delivery_order_items"
  RENAME CONSTRAINT "shipping_order_items_order_line_id_fkey" TO "delivery_order_items_order_line_id_fkey";

ALTER INDEX "app"."shipping_order_items_shipping_order_year_month_shipping_ord_idx"
  RENAME TO "delivery_order_items_delivery_order_year_month_delivery_ord_idx";
ALTER INDEX "app"."shipping_order_items_order_line_id_idx"
  RENAME TO "delivery_order_items_order_line_id_idx";

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 参照列（delivery_notes / invoice_items）
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "app"."delivery_notes"
  RENAME COLUMN "shipping_order_year_month" TO "delivery_order_year_month";
ALTER TABLE "app"."delivery_notes"
  RENAME COLUMN "shipping_order_seq" TO "delivery_order_seq";
ALTER TABLE "app"."delivery_notes"
  RENAME CONSTRAINT "delivery_notes_shipping_order_year_month_shipping_order_se_fkey"
               TO "delivery_notes_delivery_order_year_month_delivery_order_se_fkey";
ALTER INDEX "app"."delivery_notes_shipping_order_year_month_shipping_order_seq_idx"
  RENAME TO "delivery_notes_delivery_order_year_month_delivery_order_seq_idx";

ALTER TABLE "app"."invoice_items"
  RENAME COLUMN "shipping_order_year_month" TO "delivery_order_year_month";
ALTER TABLE "app"."invoice_items"
  RENAME COLUMN "shipping_order_seq" TO "delivery_order_seq";
-- 二重請求ガードの部分ユニーク索引（billing_dedupe — Prisma 管理外の命名）
ALTER INDEX "app"."invoice_items_shipping_order_unique"
  RENAME TO "invoice_items_delivery_order_unique";

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 多態子行の purge トリガー（テーブル名・接頭辞が引数の文字列なので作り直す）
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS purge_children_after_delete ON "app"."delivery_orders";
CREATE TRIGGER purge_children_after_delete
  AFTER DELETE ON "app"."delivery_orders"
  FOR EACH ROW EXECUTE FUNCTION
  app.purge_document_children('delivery_orders', 'doc', 'DOR');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. 文字列で書類を指す参照データの書き換え
-- ─────────────────────────────────────────────────────────────────────────────

-- 採番（表示接頭辞 SHP → DOR。キーも合わせる）
UPDATE "app"."numbering_sequences"
   SET "key" = 'DELIVERY_ORDER', "prefix" = 'DOR'
 WHERE "key" = 'SHIPPING';

-- 監査ログ（書類は消しても監査は残す規約なので、参照だけ付け替える）
UPDATE "app"."audit_logs"
   SET "table_name" = 'delivery_orders',
       "record_id" = regexp_replace("record_id", '^SHP-', 'DOR-')
 WHERE "table_name" = 'shipping_orders';

-- メモ・改訂・添付（owner_type/owner_id の多態参照）
UPDATE "app"."document_memos"
   SET "owner_type" = 'delivery_orders',
       "owner_id" = regexp_replace("owner_id", '^SHP-', 'DOR-')
 WHERE "owner_type" = 'shipping_orders';
UPDATE "app"."document_memo_revisions"
   SET "owner_type" = 'delivery_orders',
       "owner_id" = regexp_replace("owner_id", '^SHP-', 'DOR-')
 WHERE "owner_type" = 'shipping_orders';
UPDATE "app"."document_attachments"
   SET "owner_type" = 'delivery_orders',
       "owner_id" = regexp_replace("owner_id", '^SHP-', 'DOR-')
 WHERE "owner_type" = 'shipping_orders';

-- 在庫取引の参照（reference_type + 参照番号 + 備考中の番号）
UPDATE "app"."inventory_transactions"
   SET "reference_type" = 'delivery_order',
       "reference_id" = regexp_replace("reference_id", '^SHP-', 'DOR-'),
       "notes" = replace("notes", 'SHP-', 'DOR-')
 WHERE "reference_type" = 'shipping_order';

-- 権限コード（role_permission_relation は ON UPDATE CASCADE で追従）。
-- 表示名は en だけ変え、ja の「出荷書」は据え置く。
UPDATE "app"."permissions"
   SET "code" = 'delivery_order',
       "display_name" = '{"ja":"出荷書","en":"Delivery order"}'::jsonb
 WHERE "code" = 'shipping_order';

-- フィーチャーフラグ（アプリキー shipping-orders → delivery-orders）
UPDATE "app"."feature_flags"
   SET "key" = replace("key", 'app:shipping-orders', 'app:delivery-orders')
 WHERE "key" LIKE 'app:shipping-orders%';
