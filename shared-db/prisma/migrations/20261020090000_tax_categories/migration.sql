-- 税区分マスタ — 課税区分を「顧客 1 人につき 1 率」から「製品と顧客の両方が同じ
-- マスタを参照する」形へ移す（§9 会計・請求）。
--
-- これまでの形: 顧客属性 bp_customer_attrs.tax_type（enum app.TAX_TYPE）を nextjs-web の
-- TypeScript リテラル（lib/tax-rate.ts の 10/8/0%）に通し、請求書 1 通にその 1 率だけを
-- 掛けていた。そのため
--   (a) 軽減税率が「何を売るか」ではなく「誰に売るか」で決まっていた、
--   (b) 税制改正がコードのデプロイになっていた、
--   (c) 8% と 10% が混ざった請求書をデータモデルとして表現できなかった
--       （invoice_items に税の列が無く、invoices は率を 1 本しか持たない）。
--
-- ★ このマイグレーションは**既存の請求額を 1 円も動かさない**。担保は 3 点:
--   1. 顧客を全行 backfill する（TAXABLE も含む）ので、全顧客が「明示の区分」を持つ。
--      区分は顧客が優先なので、製品側に何を設定しても既存顧客には効かない。
--   2. 率行は現行率 1 本（適用開始日 1900-01-01）だけ入れる。5% / 8% 時代の歴史行を
--      入れると、注文日が古い書類の再描画で率が動いてしまう。
--   3. 既存の請求書には invoice_tax_summaries の行を作らない。読み出し側は「束が無い
--      請求書はヘッダ（tax_type / tax_rate / subtotal / tax_amount）から 1 本の束を
--      合成する」ので、画面・PDF・弥生 CSV の出力は変わらない。
--
-- bp_customer_attrs.tax_type は**まだ落とさない**。ローリングデプロイ中は旧コンテナが
-- その列を書き続けるため、DROP は移行が全経路で完了したあとの別マイグレーションで行う。
--
-- 以下 CreateTable / AlterTable / AddForeignKey は prisma migrate dev の生成そのまま。
-- 部分 unique index と初期データは Prisma が表現できないので末尾に手で足してある。

-- AlterTable
ALTER TABLE "app"."bp_customer_attrs" ADD COLUMN     "tax_category_id" INTEGER;

-- AlterTable
ALTER TABLE "app"."invoice_items" ADD COLUMN     "tax_category_id" INTEGER,
ADD COLUMN     "tax_rate" DECIMAL(5,4);

-- AlterTable
ALTER TABLE "app"."products" ADD COLUMN     "tax_category_id" INTEGER;

-- AlterTable
ALTER TABLE "app"."quote_items" ADD COLUMN     "tax_category_id" INTEGER,
ADD COLUMN     "tax_rate" DECIMAL(5,4);

-- CreateTable
CREATE TABLE "app"."tax_categories" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "short_label" JSONB,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tax_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."tax_category_rates" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "rate" DECIMAL(5,4) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tax_category_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."invoice_tax_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_year_month" CHAR(6) NOT NULL,
    "invoice_seq" INTEGER NOT NULL,
    "tax_category_id" INTEGER,
    "tax_rate" DECIMAL(5,4) NOT NULL,
    "taxable_base" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_tax_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_categories_code_key" ON "app"."tax_categories"("code");

-- CreateIndex
CREATE INDEX "tax_categories_is_active_sort_order_idx" ON "app"."tax_categories"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "tax_category_rates_category_id_effective_from_key" ON "app"."tax_category_rates"("category_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_tax_summaries_invoice_year_month_invoice_seq_tax_ra_key" ON "app"."invoice_tax_summaries"("invoice_year_month", "invoice_seq", "tax_rate");

-- CreateIndex
CREATE INDEX "bp_customer_attrs_tax_category_id_idx" ON "app"."bp_customer_attrs"("tax_category_id");

-- CreateIndex
CREATE INDEX "invoice_items_tax_category_id_idx" ON "app"."invoice_items"("tax_category_id");

-- CreateIndex
CREATE INDEX "products_tax_category_id_idx" ON "app"."products"("tax_category_id");

-- CreateIndex
CREATE INDEX "quote_items_tax_category_id_idx" ON "app"."quote_items"("tax_category_id");

-- AddForeignKey
ALTER TABLE "app"."invoice_items" ADD CONSTRAINT "invoice_items_tax_category_id_fkey" FOREIGN KEY ("tax_category_id") REFERENCES "app"."tax_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."bp_customer_attrs" ADD CONSTRAINT "bp_customer_attrs_tax_category_id_fkey" FOREIGN KEY ("tax_category_id") REFERENCES "app"."tax_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."products" ADD CONSTRAINT "products_tax_category_id_fkey" FOREIGN KEY ("tax_category_id") REFERENCES "app"."tax_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."quote_items" ADD CONSTRAINT "quote_items_tax_category_id_fkey" FOREIGN KEY ("tax_category_id") REFERENCES "app"."tax_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tax_category_rates" ADD CONSTRAINT "tax_category_rates_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app"."tax_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."invoice_tax_summaries" ADD CONSTRAINT "invoice_tax_summaries_invoice_year_month_invoice_seq_fkey" FOREIGN KEY ("invoice_year_month", "invoice_seq") REFERENCES "app"."invoices"("year_month", "seq") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."invoice_tax_summaries" ADD CONSTRAINT "invoice_tax_summaries_tax_category_id_fkey" FOREIGN KEY ("tax_category_id") REFERENCES "app"."tax_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 以下は手で足した分（Prisma スキーマからは生成されない）────────────────────

-- 既定の区分は 1 つだけ。部分 unique index は Prisma が表現できないので直接書く
-- （bp_sales_reps_primary_uniq / kiosk_cards_one_assigned_per_user と同じ流儀）。
CREATE UNIQUE INDEX "tax_categories_is_default_idx"
  ON "app"."tax_categories"("is_default") WHERE "is_default";

-- 初期データ — code は既存 enum app.TAX_TYPE の値そのもの。既存の顧客行がそのまま移れる。
INSERT INTO "app"."tax_categories" ("code", "name", "short_label", "is_default", "sort_order", "updated_at")
VALUES
  ('TAXABLE', '{"ja":"課税","en":"Taxable"}'::jsonb,             NULL,                                  true,  10, CURRENT_TIMESTAMP),
  ('REDUCED', '{"ja":"軽減税率","en":"Reduced tax rate"}'::jsonb, '{"ja":"軽減","en":"Reduced"}'::jsonb, false, 20, CURRENT_TIMESTAMP),
  ('EXEMPT',  '{"ja":"非課税","en":"Tax exempt"}'::jsonb,        '{"ja":"非課税","en":"Exempt"}'::jsonb, false, 30, CURRENT_TIMESTAMP);

-- 率は**現行率 1 本だけ**、適用開始日 1900-01-01（上の担保 2）。
INSERT INTO "app"."tax_category_rates" ("category_id", "effective_from", "rate", "updated_at")
SELECT "id", DATE '1900-01-01',
       CASE "code" WHEN 'TAXABLE' THEN 0.1000 WHEN 'REDUCED' THEN 0.0800 ELSE 0.0000 END,
       CURRENT_TIMESTAMP
  FROM "app"."tax_categories";

-- 顧客の backfill — **全行**（TAXABLE も必ず埋める）。null は「製品に従う」の意味に
-- なるので、既存の TAXABLE を null に倒すと、誰かが製品を軽減税率にした瞬間に既存顧客の
-- 税額が動く。だから明示的に「課税」を入れる（上の担保 1）。
UPDATE "app"."bp_customer_attrs" a
   SET "tax_category_id" = c."id"
  FROM "app"."tax_categories" c
 WHERE c."code" = a."tax_type"::text;

-- products / invoice_items / quote_items / invoice_tax_summaries は backfill しない
-- （担保 2・3）。
