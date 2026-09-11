-- 工程リストを 準備工程 / 製造工程 に分ける（§7）。
--
-- これまで工程リスト（product_process_routes）は製品 × 受注元ごとに 1 本で、
-- 「素材出し → 切断 → センタレス → 全長合わせ → C面」という**素材の仕立て**まで
-- 製品ごとに持っていた。仕立ては製品で変わらないので、製品が増えるたびに同じ
-- 5 工程を組み直し、直すときは全製品を回ることになっていた。
--
-- 分けたあとの形:
--   PREP           準備工程リスト — 〇〇出し・受渡し と 材料準備。製品にも顧客にも
--                  紐づかない共通のリスト。
--   MANUFACTURING  製造工程リスト — 加工以降。従来どおり 製品 × 受注元 ごと。
-- 指示書の工程は 2 本を合わせたもので、work_orders は両方の版を指す。
--
-- 既存のルートは全部 MANUFACTURING になる。版の中に準備工程が混ざったまま残す —
-- 消すと、それを指している使用済みの指示書の出所が嘘になる。混ざった版を
-- ビルダーで開いたときの扱いはアプリ側（lib/product-routes.ts）。
--
-- どの工程が準備側かは DB では決めない（カタログの category = MATERIAL_PREP を
-- nextjs-web lib/workflow-core.ts isPrepStep が読む）。ここが持つのは
-- 「kind ごとにどの列が要るか」だけ。

CREATE TYPE "app"."PROCESS_ROUTE_KIND" AS ENUM ('PREP', 'MANUFACTURING');

ALTER TABLE "app"."product_process_routes"
  ADD COLUMN "kind" "app"."PROCESS_ROUTE_KIND" NOT NULL DEFAULT 'MANUFACTURING';

-- 準備工程リストは製品を持たない。NOT NULL を外すが、MANUFACTURING では
-- 引き続き必須 — 列の意味を kind で切り替えるので、片方だけ空を許す。
ALTER TABLE "app"."product_process_routes"
  ALTER COLUMN "product_id" DROP NOT NULL;

ALTER TABLE "app"."product_process_routes"
  ADD CONSTRAINT "product_process_routes_kind_columns"
  CHECK (
    ("kind" = 'PREP' AND "product_id" IS NULL AND "customer_bp_id" IS NULL)
    OR ("kind" = 'MANUFACTURING' AND "product_id" IS NOT NULL)
  );

CREATE INDEX "product_process_routes_kind_idx"
  ON "app"."product_process_routes"("kind");

-- 指示書が使った準備工程リストの版。製造側（route_version_id）と同じ扱い —
-- ルートが消えても工程は work_order_steps に実体化済みなので出所だけ外れる。
ALTER TABLE "app"."work_orders"
  ADD COLUMN "prep_route_version_id" UUID;

ALTER TABLE "app"."work_orders"
  ADD CONSTRAINT "work_orders_prep_route_version_id_fkey"
    FOREIGN KEY ("prep_route_version_id")
    REFERENCES "app"."product_process_route_versions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "work_orders_prep_route_version_id_idx"
  ON "app"."work_orders"("prep_route_version_id");
