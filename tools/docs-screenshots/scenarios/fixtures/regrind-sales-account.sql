-- regrind-sales-account.sql — 「製品の売上」と「再研磨の売上」が 1 通に載った発行済みの請求書を用意する。
--
-- 会計連携（仕訳 CSV）は、請求明細 → 注文明細の注文種別で売上高の科目を振り分ける。
-- デモシードの請求書 INV-202606-00001（発行済・税抜 161,000 / 税 16,100）は明細が
-- 注文明細に結び付いておらず、再研磨の明細も無い。ここまでを画面から作るには
-- 受注 → 指示書 → 全工程 → 出荷 → 締日処理 が 2 系統ぶん要るので、準備として SQL で
-- 直す（確かめる対象 = 会計連携の設定と出力は、シナリオが画面で行う）:
--
--   1) 再研磨の注文明細を 1 行足す（注文請書 ORD-202607-00003 の 3 行目・出荷済）
--   2) 請求書の明細を 2 行にする。合計は変えない（100,000 + 61,000 = 161,000）
--        1 行目 … 超硬エンドミル 50 本 × 2,000 = 100,000 → 本番（PRODUCTION）の注文明細
--        2 行目 … 再研磨         50 本 × 1,220 =  61,000 → 再研磨（REGRIND）の注文明細
--   3) 税率ごとの束（10%・税抜 161,000・税 16,100）を足す。注文種別の内訳は
--      束 × 明細の税率で集計されるので、明細にも 10% を入れる。

INSERT INTO app.order_lines
  (id, acceptance_id, branch, sort_order, item_id, tool_item_id, product_text,
   order_type, quantity, unit_price, amount, delivery_date, status, confirmed_at)
SELECT 'e0000000-0000-4000-8000-0000000000a1', o.id, 3, 3,
       (SELECT id FROM app.items WHERE code = 'RGD-202601-0001'),
       9001, '再研磨 超硬エンドミル 4枚刃 φ6×60',
       'REGRIND', 50, 1220, 61000, DATE '2026-06-20', 'SHIPPED', TIMESTAMPTZ '2026-06-05 09:00+09'
  FROM app.order_acceptances o
 WHERE o.legacy_number = 'ORD-202607-00003';

UPDATE app.invoice_items ii
   SET unit_price = 2000, amount = 100000,
       order_line_id = 'e0000000-0000-4000-8000-000000000001',
       tax_rate = 0.10,
       tax_category_id = (SELECT id FROM app.tax_categories WHERE code = 'TAXABLE')
  FROM app.invoices i
 WHERE i.id = ii.invoice_id AND i.legacy_number = 'INV-202606-00001';

INSERT INTO app.invoice_items
  (invoice_id, delivery_order_id, description, quantity, unit_price, amount, sort_order,
   order_line_id, tax_rate, tax_category_id)
SELECT i.id,
       (SELECT delivery_order_id FROM app.invoice_items WHERE invoice_id = i.id LIMIT 1),
       '{"ja": "再研磨 超硬エンドミル 4枚刃 φ6×60", "en": "Regrind carbide end mill 4F φ6×60"}',
       50, 1220, 61000, 1,
       'e0000000-0000-4000-8000-0000000000a1', 0.10,
       (SELECT id FROM app.tax_categories WHERE code = 'TAXABLE')
  FROM app.invoices i
 WHERE i.legacy_number = 'INV-202606-00001';

INSERT INTO app.invoice_tax_summaries (invoice_id, tax_category_id, tax_rate, taxable_base, tax_amount, sort_order)
SELECT i.id, (SELECT id FROM app.tax_categories WHERE code = 'TAXABLE'), 0.10, 161000, 16100, 0
  FROM app.invoices i
 WHERE i.legacy_number = 'INV-202606-00001';
