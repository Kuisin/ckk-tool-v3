-- 配送情報（出荷先・配送方法・担当拠点・出荷作業場所）を注文請書ヘッダ
-- (order_acceptances) から注文明細 (order_lines) へ移す（§2 / §8）。
--
-- これまでの形: 1 通の注文請書は 1 つの届け先しか表せなかった（4 列すべて
-- ヘッダにあった）。同じ注文書の中で行ごとに届け先が違う注文を表せない —
-- 出荷書の束ね可否 (combinabilityError) やエンドユーザー・納期はもともと
-- 明細ごとの属性として扱っていたので、この 4 つだけが取り残されていた。
--
-- ★ ローリングデプロイ対応: order_acceptances 側の 4 列は**このマイグレー
--   ションでは落とさない**。デプロイの入れ替え中は新旧のコンテナが同時に
--   動き、旧コンテナはまだヘッダの列を SELECT するため。アプリはこの
--   マイグレーション以降ヘッダの列を読み書きしない（Prisma スキーマに
--   @deprecated と明記済み）。dev で 1 回デプロイが回ったあと、
--   allow-destructive な別マイグレーションで DROP する。
--
-- 既存行はヘッダの値をそのまま複写する — 移行の瞬間に挙動が変わらないように。

-- AlterTable
ALTER TABLE "app"."order_lines"
  ADD COLUMN "ship_to_bp_id" UUID,
  ADD COLUMN "delivery_method" "app"."DELIVERY_METHOD" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "assigned_plant_id" INTEGER,
  ADD COLUMN "shipping_work_location_id" INTEGER;

-- Backfill: 既存の全明細へヘッダの配送情報を複写する。
UPDATE "app"."order_lines" l
SET
  "ship_to_bp_id" = a."ship_to_bp_id",
  "delivery_method" = a."delivery_method",
  "assigned_plant_id" = a."assigned_plant_id",
  "shipping_work_location_id" = a."shipping_work_location_id"
FROM "app"."order_acceptances" a
WHERE l."acceptance_year_month" = a."year_month"
  AND l."acceptance_seq" = a."seq";

-- CreateIndex
CREATE INDEX "order_lines_ship_to_bp_id_idx" ON "app"."order_lines"("ship_to_bp_id");

-- AddForeignKey
ALTER TABLE "app"."order_lines" ADD CONSTRAINT "order_lines_ship_to_bp_id_fkey" FOREIGN KEY ("ship_to_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."order_lines" ADD CONSTRAINT "order_lines_assigned_plant_id_fkey" FOREIGN KEY ("assigned_plant_id") REFERENCES "app"."plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."order_lines" ADD CONSTRAINT "order_lines_shipping_work_location_id_fkey" FOREIGN KEY ("shipping_work_location_id") REFERENCES "app"."work_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
