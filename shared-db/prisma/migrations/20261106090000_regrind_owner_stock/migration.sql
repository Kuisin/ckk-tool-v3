-- 再研磨（顧客が使った工具 — 自社製・他社製 — を預かって研ぎ直す）第 1 段: 型と列。
--
-- 再研磨は製造ではない。作るものは無く、顧客の物を預かって手を入れて返す。
-- v3 には概念が 1 つも無かった（旧 FileMaker の「再研システム」は 6.6 万件の
-- 再研受注を持っていた）。ここでは
--   (1) 注文種別・指示書種別・工程カテゴリ・工程リスト種別に REGRIND を足し、
--   (2) 他社製の工具を品目マスタに「他社製品」として置けるようにし、
--   (3) 在庫台帳に**所有者**の軸を足す。
--
-- ## 所有者（owner_bp_id）は預け先（custody_bp_id）とは別の軸
--
--   custody = いま誰が持っているか（外注先）     owner = 誰の物か（顧客）
--
-- 両方入ることがある（預り品をコーティング外注へ出した状態）。owner が入っている
-- 行は**自社在庫ではない** — 手持ち・引当・出荷（通常明細）・棚卸・ATP・分析ビュー
-- のすべてから外す。読み出しの責任は custody と同じ（`owner_bp_id IS NULL` で絞る。
-- nextjs-web の inventory-custody-scope.test.ts が両軸を走査して止める）。
--
-- FK は RESTRICT — custody は SET NULL だが、所有者で同じことをすると顧客を消した
-- 瞬間に預り品が自社在庫に化ける。
--
-- ## 他社製品
--
-- 他社が作った工具は品目マスタに無いので、再研磨の注文明細が指せる行が無かった。
-- item_type = PRODUCT の行に印を付ける形にして、製造工程リスト・製造分の指示書・
-- PRODUCTION/TEST/SAMPLE の明細では選べないようにする（その制限はアプリ側 —
-- DB は「素材を他社製品にはできない」だけを守る）。メーカーは BP にしない
-- （競合メーカーは取引先ではなく、BP 行にすると顧客・仕入先のピッカーに混ざる）。
--
-- ## 新しい enum 値をこの migration の中で使わない
--
-- Prisma は 1 ファイルを 1 トランザクションに包むので、ADD VALUE した値は
-- コミットまで使えない。CHECK の書き換えと工程マスタの seed は次の migration。

ALTER TYPE "app"."ORDER_TYPE"               ADD VALUE IF NOT EXISTS 'REGRIND';
ALTER TYPE "app"."WORK_ORDER_TYPE"          ADD VALUE IF NOT EXISTS 'REGRIND';
ALTER TYPE "app"."PROCESS_CATEGORY"         ADD VALUE IF NOT EXISTS 'REGRIND';
ALTER TYPE "app"."PROCESS_ROUTE_KIND"       ADD VALUE IF NOT EXISTS 'REGRIND';
ALTER TYPE "app"."INVENTORY_MOVEMENT_CAUSE" ADD VALUE IF NOT EXISTS 'REGRIND_RECEIPT';

-- ── 他社製品 ─────────────────────────────────────────────────────────────────
ALTER TABLE "app"."items"
  ADD COLUMN "is_external_product" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "maker_name" TEXT;

ALTER TABLE "app"."items"
  ADD CONSTRAINT "items_external_product_is_product"
  CHECK ("is_external_product" = false OR "item_type" = 'PRODUCT');

-- ── 所有者 ───────────────────────────────────────────────────────────────────
ALTER TABLE "app"."item_inventory" ADD COLUMN "owner_bp_id" UUID;

ALTER TABLE "app"."item_inventory"
  ADD CONSTRAINT "item_inventory_owner_bp_id_fkey"
  FOREIGN KEY ("owner_bp_id") REFERENCES "app"."business_partners"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "item_inventory_owner_bp_id_idx" ON "app"."item_inventory"("owner_bp_id");

-- バケットの一意キーに所有者を足す。**NULLS NOT DISTINCT のまま** —
-- 既存行は全部 NULL なので、いまある行の一意性は 1 ミリも変わらない
-- （20261103090000_outsource_custody と同じ手順）。足さないと「自社の未割当
-- バケット」と「顧客 A の預り品バケット」が同じ行になり、預かった瞬間に
-- 自社在庫が増える。
DROP INDEX "app"."item_inventory_bucket_key";
CREATE UNIQUE INDEX "item_inventory_bucket_key"
  ON "app"."item_inventory" ("item_id", "plant_id", "lot_number", "is_semi_finished",
                             "storage_location_id", "shelf_id", "custody_bp_id", "owner_bp_id")
  NULLS NOT DISTINCT;

-- ── 受入計上の印（伝票へのリンクを兼ねる） ───────────────────────────────────
-- 製品受入（再研磨）の工程完了で預り品を入庫したら、その伝票をここに書く。
-- 入っていれば「もう計上した」。日付や状態で判断すると直すたびに増える
-- （outsource_issue_movement_id と同じ規約）。
ALTER TABLE "app"."work_order_steps" ADD COLUMN "regrind_receipt_movement_id" UUID;

ALTER TABLE "app"."work_order_steps"
  ADD CONSTRAINT "work_order_steps_regrind_receipt_movement_id_fkey"
  FOREIGN KEY ("regrind_receipt_movement_id") REFERENCES "app"."inventory_movements"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
