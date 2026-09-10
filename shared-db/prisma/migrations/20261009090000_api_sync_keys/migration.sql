-- AlterTable
ALTER TABLE "app"."billing_closings" ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "app"."inventory_reservations" ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "billing_closings_updated_at_id_idx" ON "app"."billing_closings"("updated_at", "id");

-- CreateIndex
CREATE INDEX "bp_contacts_updated_at_id_idx" ON "app"."bp_contacts"("updated_at", "id");

-- CreateIndex
CREATE INDEX "business_partners_updated_at_id_idx" ON "app"."business_partners"("updated_at", "id");

-- CreateIndex
CREATE INDEX "delivery_notes_updated_at_year_month_seq_idx" ON "app"."delivery_notes"("updated_at", "year_month", "seq");

-- CreateIndex
CREATE INDEX "delivery_orders_updated_at_year_month_seq_idx" ON "app"."delivery_orders"("updated_at", "year_month", "seq");

-- CreateIndex
CREATE INDEX "inventory_reservations_updated_at_id_idx" ON "app"."inventory_reservations"("updated_at", "id");

-- CreateIndex
CREATE INDEX "inventory_transactions_created_at_id_idx" ON "app"."inventory_transactions"("created_at", "id");

-- CreateIndex
CREATE INDEX "invoices_updated_at_year_month_seq_idx" ON "app"."invoices"("updated_at", "year_month", "seq");

-- CreateIndex
CREATE INDEX "material_inventory_updated_at_id_idx" ON "app"."material_inventory"("updated_at", "id");

-- CreateIndex
CREATE INDEX "material_types_updated_at_id_idx" ON "app"."material_types"("updated_at", "id");

-- CreateIndex
CREATE INDEX "materials_updated_at_id_idx" ON "app"."materials"("updated_at", "id");

-- CreateIndex
CREATE INDEX "order_acceptances_updated_at_year_month_seq_idx" ON "app"."order_acceptances"("updated_at", "year_month", "seq");

-- CreateIndex
CREATE INDEX "order_lines_updated_at_id_idx" ON "app"."order_lines"("updated_at", "id");

-- CreateIndex
CREATE INDEX "plants_updated_at_id_idx" ON "app"."plants"("updated_at", "id");

-- CreateIndex
CREATE INDEX "product_inventory_updated_at_id_idx" ON "app"."product_inventory"("updated_at", "id");

-- CreateIndex
CREATE INDEX "products_updated_at_id_idx" ON "app"."products"("updated_at", "id");

-- CreateIndex
CREATE INDEX "quotes_updated_at_year_month_seq_idx" ON "app"."quotes"("updated_at", "year_month", "seq");

-- CreateIndex
CREATE INDEX "storage_locations_updated_at_id_idx" ON "app"."storage_locations"("updated_at", "id");

-- CreateIndex
CREATE INDEX "work_orders_updated_at_id_idx" ON "app"."work_orders"("updated_at", "id");

-- ===========================================================================
-- updated_at を DB 側で維持する（BEFORE UPDATE トリガー）
--
-- ■ なぜ要るのか
-- `@updatedAt` は **Prisma Client を通る書き込みしか**更新しない。psql・
-- `$executeRaw`・マイグレーションの backfill `UPDATE` を通った行は
-- updated_at が動かず、`/api/v1` の差分同期（?updatedSince=）が**その行を
-- 黙って飛ばす**。外部の連携先から見ると「更新したのに永久に届かない 1 行」に
-- なり、原因が最も分かりにくい壊れ方をする。
--
-- そこで DB を正にする。`@updatedAt` は無害な二重化として残す（Prisma が
-- 送ってくる値をトリガーが now() で上書きするだけ）。
--
-- ■ 対象は「差分同期に載せる表」だけ
-- 全表に付けないのは、トリガーが無料ではないから（大量更新のたびに 1 行ずつ
-- 発火する）。ここに挙げた表は /api/v1 が資源として公開するものに限る。
-- **表を公開したらここにも足すこと** — 足し忘れると sync が飛ばす。
--
-- ■ 冪等
-- 関数は CREATE OR REPLACE、トリガーは DROP してから CREATE。再実行してよい。
-- ===========================================================================

CREATE OR REPLACE FUNCTION app.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION app.touch_updated_at() IS
  '差分同期（/api/v1 の ?updatedSince=）のため updated_at を DB 側で維持する。Prisma の @updatedAt は Prisma 経由の書き込みしか更新しないので、psql や $executeRaw を通った行が同期から漏れるのを防ぐ。';

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- 販売・生産
    'order_acceptances', 'order_lines', 'work_orders', 'quotes',
    -- 出荷・請求
    'delivery_orders', 'delivery_notes', 'invoices', 'billing_closings',
    -- マスタ
    'business_partners', 'bp_contacts', 'products', 'materials',
    'material_types', 'plants', 'storage_locations',
    -- 在庫
    'product_inventory', 'material_inventory', 'inventory_reservations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS touch_updated_at ON app.%I', t);
    EXECUTE format(
      'CREATE TRIGGER touch_updated_at BEFORE UPDATE ON app.%I '
      'FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()', t);
  END LOOP;
END
$$;

-- ===========================================================================
-- 差分同期の順序キーを**ミリ秒精度**にする
--
-- ■ なぜ必要か（実際に踏んだ）
-- `timestamptz(6)` はマイクロ秒まで保存するが、JS の `Date` はミリ秒までしか
-- 表現できない。カーソルは `Date.toISOString()`（ミリ秒）で作るので、
-- 保存値 `...743431` に対してカーソルは `...743` になり、
-- **`updated_at > カーソル` が同じ行にもう一度当たる**。結果、次のページを
-- 要求しても同じ 1 ページが永久に返り続ける（30 行の表を 112 行読んでも
-- 7 行しか進まなかった）。
--
-- 「ページが進まない」は運が良い方の壊れ方で、条件が変わればカーソルが
-- 飛び越して**行を落とす**側にもなる。表現できない精度で順序を決めていること
-- そのものが原因なので、**保存する精度を表現できる精度に合わせる**。
--
-- ■ 対象は差分同期に載せる列だけ
-- `/api/v1` が並び順に使う列（18 表の updated_at ＋ 不変台帳
-- inventory_transactions の created_at）。他の時刻列は 6 桁のまま。
-- ミリ秒は業務の時刻として十分で、失うのは人が読まない下 3 桁だけ。
--
-- ■ 既存行は Postgres が丸める（切り捨てではなく四捨五入）。順序は保たれる。
-- ===========================================================================

ALTER TABLE "app"."billing_closings" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "app"."bp_contacts" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "app"."business_partners" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "app"."delivery_notes" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "app"."delivery_orders" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "app"."inventory_reservations" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "app"."inventory_transactions" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "app"."invoices" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "app"."material_inventory" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "app"."material_types" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "app"."materials" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "app"."order_acceptances" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "app"."order_lines" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "app"."plants" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "app"."product_inventory" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "app"."products" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "app"."quotes" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "app"."storage_locations" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "app"."work_orders" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
