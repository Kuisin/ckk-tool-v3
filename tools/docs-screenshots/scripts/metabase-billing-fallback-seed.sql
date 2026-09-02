-- metabase-billing-fallback-seed.sql — only runs if app.invoices is EMPTY.
--
-- ckk-db-dev genuinely has 0 invoices as of 2026-09; pulling real dev data
-- (pull-ckk-dev-data.py) then makes the 請求 (billing) demo dashboard render
-- "No results" everywhere, which is accurate but useless for the manual.
-- This inserts a handful of synthetic invoices referencing REAL customer
-- business_partners already loaded (so the customer name isn't invented) —
-- idempotent-ish via the empty-table guard, safe to always run after
-- pull-ckk-dev-data.py.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.invoices) THEN
    RAISE NOTICE 'app.invoices already has rows — skipping billing fallback seed';
    RETURN;
  END IF;

  INSERT INTO app.invoices (year_month, seq, customer_bp_id, billing_period_from, billing_period_to,
    subtotal, tax_amount, total_amount, status, issued_at, due_date, currency, created_at, updated_at)
  SELECT * FROM (VALUES
    ('202606'::char(6), 1, bp1.id, '2026-06-01'::date, '2026-06-30'::date,
     180000::numeric, 18000::numeric, 198000::numeric, 'PAID'::app."INVOICE_STATUS",
     '2026-06-05 10:00+09'::timestamptz, '2026-06-30'::date, 'JPY', now(), now()),
    ('202607', 1, bp2.id, '2026-07-01', '2026-07-31',
     95000, 9500, 104500, 'SENT', '2026-07-05 10:00+09', '2026-07-31', 'JPY', now(), now()),
    ('202608', 1, bp1.id, '2026-08-01', '2026-08-31',
     142000, 14200, 156200, 'ISSUED', '2026-08-05 10:00+09', '2026-08-31', 'JPY', now(), now()),
    ('202608', 2, bp2.id, '2026-08-01', '2026-08-31',
     60000, 6000, 66000, 'DRAFT', NULL, NULL, 'JPY', now(), now())
  ) AS v
  CROSS JOIN LATERAL (
    SELECT id FROM app.business_partners bp
    JOIN app.bp_role_assignments r ON r.bp_id = bp.id AND r.role = 'CUSTOMER' AND r.is_active
    WHERE bp.name->>'ja' LIKE '%株式会社%'
    ORDER BY bp.id LIMIT 1 OFFSET 0
  ) AS bp1
  CROSS JOIN LATERAL (
    SELECT id FROM app.business_partners bp
    JOIN app.bp_role_assignments r ON r.bp_id = bp.id AND r.role = 'CUSTOMER' AND r.is_active
    WHERE bp.name->>'ja' LIKE '%株式会社%'
    ORDER BY bp.id LIMIT 1 OFFSET 1
  ) AS bp2;

  INSERT INTO app.invoice_items (invoice_year_month, invoice_seq, description, quantity, unit_price, amount, sort_order)
  VALUES
    ('202606', 1, '{"ja": "デモ用テスト製品 #001", "en": "Demo Test Product #001"}', 10, 18000, 180000, 0),
    ('202607', 1, '{"ja": "デモ用テスト製品 #002", "en": "Demo Test Product #002"}', 5, 19000, 95000, 0),
    ('202608', 1, '{"ja": "テスト製品1", "en": "Test Product 1"}', 8, 17750, 142000, 0),
    ('202608', 2, '{"ja": "テスト製品1", "en": "Test Product 1"}', 3, 20000, 60000, 0);

  RAISE NOTICE 'billing fallback seed inserted (4 invoices)';
END $$;
