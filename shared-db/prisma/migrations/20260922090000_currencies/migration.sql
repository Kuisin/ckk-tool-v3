-- 通貨マスタ + 書類・製品への通貨列。
--
-- currencies: 対円レート（1 通貨単位 = rate_to_jpy 円）の換算表。任意の 2 通貨間は
-- amount * from.rate_to_jpy / to.rate_to_jpy。レートは手動更新（分析用換算 —
-- 会計処理用ではない）。書類・製品の currency 列はプレーン varchar（既定 'JPY'）で、
-- 既存の price_list_entries.currency / material_purchase_orders.currency と同じく
-- FK は張らない（コードは currencies.code を指す運用）。

-- CreateTable
CREATE TABLE "app"."currencies" (
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "rate_to_jpy" DECIMAL(18,6) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- 初期通貨（レートは 2026-08 時点の概算 — 運用で随時更新する）
INSERT INTO "app"."currencies" ("code", "name", "rate_to_jpy", "sort_order", "updated_at") VALUES
  ('JPY', '{"ja": "日本円",       "en": "Japanese Yen"}',      1,        0, now()),
  ('USD', '{"ja": "米ドル",       "en": "US Dollar"}',         150,      1, now()),
  ('EUR', '{"ja": "ユーロ",       "en": "Euro"}',              162,      2, now()),
  ('CNY', '{"ja": "中国人民元",   "en": "Chinese Yuan"}',      21,       3, now()),
  ('THB', '{"ja": "タイバーツ",   "en": "Thai Baht"}',         4.3,      4, now()),
  ('VND', '{"ja": "ベトナムドン", "en": "Vietnamese Dong"}',   0.0057,   5, now())
ON CONFLICT ("code") DO NOTHING;

-- AlterTable — 書類・製品に通貨（既定 JPY。注文明細はヘッダから読む — sales_rep と同じ規約）
ALTER TABLE "app"."products"          ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'JPY';
ALTER TABLE "app"."quotes"            ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'JPY';
ALTER TABLE "app"."order_acceptances" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'JPY';
ALTER TABLE "app"."invoices"          ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'JPY';
