-- billing_dedupe — 二重請求の DB レベル防止（監査 P0-6）。
-- 同一出荷書は 1 つの請求明細にしか載せられない（NULL キー行 = 手動明細は対象外）。
CREATE UNIQUE INDEX "invoice_items_shipping_order_unique"
  ON "app"."invoice_items" ("shipping_order_year_month", "shipping_order_seq")
  WHERE "shipping_order_year_month" IS NOT NULL AND "shipping_order_seq" IS NOT NULL;
