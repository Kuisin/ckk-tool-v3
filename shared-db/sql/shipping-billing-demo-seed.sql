-- ⚠️ 注文明細（order_lines）統合により、このデモシードは未更新です。
--    app.sales_orders は削除され、受注ラインは app.order_lines
--    （注文請書 order_acceptances の明細行）に統合されました。
--    実行すると "relation app.sales_orders does not exist" で失敗します。
--    親の注文請書を作ったうえで order_lines を挿入する形へ書き換えが必要です。

-- shipping-billing-demo-seed.sql — 出荷・請求アプリ（SH01/SH02/BL01/BL02）のマニュアル撮影用デモデータ。
--
-- tools/docs-screenshots のローカル一時 DB に流す（orchestrate.ts SEED_FILES_POST）。
-- 実行順: sales → masters → purchase → production → 本ファイル（最後）。
--
-- 前提（先行シードが作る行）:
--   - sales-demo-seed.sql: 顧客 デモ商事 d0000000-…-0001 / 製品 9001・9002 / demo_shot ユーザー
--   - masters シード: 拠点 F01/F02（code で参照）/ END_USER BP-90005 デモ電子工業株式会社
--   - production-demo-seed.sql: 注文請書 sales_orders
--       e0000000-0000-4000-8000-000000000001 = ORD-202607-00003-01（製品 9001, 50本, ¥3,220, IN_PRODUCTION）
--       e0000000-0000-4000-8000-000000000002 = ORD-202607-00003-02（製品 9002, 100本, ¥1,850, CONFIRMED）
--     指示書番号 9001〜9004。
--
-- 冪等: 全行固定 UUID（dd… プレフィックス）/ 固定日付（2026-06/07）+ ON CONFLICT。
-- ステータスは全てシードで直接与える — 撮影フローでは 確定/出荷/発行 等のアクションを
-- クリックしない（now() が刻印され、在庫転記も走るため）。
--
-- 請求の由来（provenance）設計 — 締日処理の「未請求」判定と整合させる:
--   collectClosingCandidates は SHIPPED×DISPATCH の出荷書のうち invoice_items の
--   由来キーに現れないものを未請求とみなす。そこで
--     - 6月出荷 DOR-202606-00001（SHIPPED）→ 6月請求書 INV-202606-00001 の明細が参照（請求済み）
--     - 7月出荷 DOR-202607-00001（SHIPPED）→ どの請求書からも未参照（未請求）
--   → 7月の PENDING 締日行の対象出荷が DOR-202607-00001 のみ（30×¥3,220 = ¥96,600）で
--     ライブ計算と total_amount が一致する。
--
-- 拠点スコープについて: demo_shot は staff ロールのみ（rbac-seed.sql — 全業務コード
-- scope ALL）なので、出荷書一覧の PLANT スコープ（plantWhere）は制限にならない。
-- user_plants 行は不要（production シード側が追加する行にも依存しない）。

BEGIN;

-- ── 撮影用フラグ ────────────────────────────────────────────────────────────
-- 撮影は APP_ENV=main で行うため、main 未公開の 4 アプリを撮影 DB に限り有効化する
-- （キーは docker-compose/nextjs-web/src/lib/app-list.ts の key に一致）。
INSERT INTO app.feature_flags (key, is_enabled, description, updated_at) VALUES
  ('app:delivery-orders:main',  true, '出荷書（マニュアル撮影用）',   now()),
  ('app:delivery-notes:main',   true, '納品書（マニュアル撮影用）',   now()),
  ('app:invoices:main',         true, '請求書（マニュアル撮影用）',   now()),
  ('app:billing-closings:main', true, '締日処理（マニュアル撮影用）', now())
ON CONFLICT (key) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled, updated_at = now();

-- ── 出荷書（DOR-202607-00001〜00003 + 請求由来用の DOR-202606-00001）────────
-- DOR-202607-00001: 出荷済（発送・F01）— 7月締めの未請求対象 + DRN-1 の元
-- DOR-202607-00002: 確定（発送・F01）— 納品書作成可の実例 + DRN-2（直送）の元
-- DOR-202607-00003: 下書き（在庫保管・F02）— 在庫保管バッジ + 下書き編集の実例
-- DOR-202606-00001: 出荷済（6月）— INV-202606-00001 の由来（請求済み → 7月締めから除外）
-- ヘッダは顧客を持ち（明細をまたいで同一）、**注文明細へのリンクは明細行側**に
-- 移った（旧 delivery_orders.sales_order_id は廃止）。顧客はデモ商事。
INSERT INTO app.delivery_orders (year_month, seq, customer_bp_id, work_order_id, from_plant_id,
  type, status, shipped_at, notes, created_by, created_at, updated_at)
VALUES
  ('202607', 1, 'd0000000-0000-4000-8000-000000000001'::uuid, NULL,
   (SELECT id FROM app.plants WHERE code = 'F01'),
   'DISPATCH'::app."SHIPPING_TYPE", 'SHIPPED'::app."SHIPPING_STATUS",
   '2026-07-10T10:30:00+09', NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-09T09:00:00+09', '2026-07-10T10:30:00+09'),
  ('202607', 2, 'd0000000-0000-4000-8000-000000000001'::uuid, NULL,
   (SELECT id FROM app.plants WHERE code = 'F01'),
   'DISPATCH'::app."SHIPPING_TYPE", 'CONFIRMED'::app."SHIPPING_STATUS",
   NULL, NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-13T11:00:00+09', '2026-07-13T14:00:00+09'),
  ('202607', 3, 'd0000000-0000-4000-8000-000000000001'::uuid, NULL,
   (SELECT id FROM app.plants WHERE code = 'F02'),
   'STOCK_STORAGE'::app."SHIPPING_TYPE", 'DRAFT'::app."SHIPPING_STATUS",
   NULL, '予備製作分の在庫保管（請求フロー外）',
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-14T15:00:00+09', '2026-07-14T15:00:00+09'),
  ('202606', 1, 'd0000000-0000-4000-8000-000000000001'::uuid, NULL,
   (SELECT id FROM app.plants WHERE code = 'F01'),
   'DISPATCH'::app."SHIPPING_TYPE", 'SHIPPED'::app."SHIPPING_STATUS",
   '2026-06-20T14:00:00+09', NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-06-19T09:00:00+09', '2026-06-20T14:00:00+09')
ON CONFLICT (year_month, seq) DO NOTHING;

-- 明細（ロット = 指示書番号。DOR-1 は完了指示書 9004 のロットを出荷する想定）。
-- どの注文明細を出荷したかは order_line_id で行ごとに持つ:
--   -01（製品 9001）… DOR-1 / DOR-2 / DOR-202606-1
--   -02（製品 9002）… DOR-3（在庫保管）
INSERT INTO app.delivery_order_items (id, delivery_order_year_month, delivery_order_seq,
  order_line_id, product_id, lot_number, quantity, notes, sort_order)
VALUES
  ('dd000000-0000-4000-8000-000000000011'::uuid, '202607', 1,
   'e0000000-0000-4000-8000-000000000001'::uuid, 9001, 9004, 30, NULL, 0),
  ('dd000000-0000-4000-8000-000000000012'::uuid, '202607', 2,
   'e0000000-0000-4000-8000-000000000001'::uuid, 9001, NULL, 20, NULL, 0),
  ('dd000000-0000-4000-8000-000000000013'::uuid, '202607', 3,
   'e0000000-0000-4000-8000-000000000002'::uuid, 9002, NULL, 50, NULL, 0),
  ('dd000000-0000-4000-8000-000000000014'::uuid, '202606', 1,
   'e0000000-0000-4000-8000-000000000001'::uuid, 9001, NULL, 50, NULL, 0)
ON CONFLICT (id) DO NOTHING;

-- ── 納品書（DRN-202607-00001〜00002）────────────────────────────────────────
-- DRN-1: 通常納品・発行済・価格記載あり（明細に単価/金額 + 合計が写る）
-- DRN-2: ユーザー直送・下書き・価格記載なし（最終需要家 = デモ電子工業、単価/金額は保存しない）
INSERT INTO app.delivery_notes (year_month, seq, delivery_order_year_month, delivery_order_seq,
  delivery_method, recipient_bp_id, recipient_branch_bp_id, end_user_bp_id,
  include_price, pdf_file_id, status, delivered_at, notes, created_by, created_at, updated_at)
VALUES
  ('202607', 1, '202607', 1,
   'NORMAL'::app."DELIVERY_METHOD",
   'd0000000-0000-4000-8000-000000000001'::uuid, NULL, NULL,
   true, NULL, 'ISSUED'::app."DELIVERY_STATUS", NULL, NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-10T11:00:00+09', '2026-07-10T11:30:00+09'),
  ('202607', 2, '202607', 2,
   'DIRECT_TO_USER'::app."DELIVERY_METHOD",
   'd0000000-0000-4000-8000-000000000001'::uuid, NULL,
   (SELECT id FROM app.business_partners WHERE bp_code = 'BP-90005'),
   false, NULL, 'DRAFT'::app."DELIVERY_STATUS", NULL, NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-13T15:00:00+09', '2026-07-13T15:00:00+09')
ON CONFLICT (year_month, seq) DO NOTHING;

INSERT INTO app.delivery_note_items (id, delivery_note_year_month, delivery_note_seq,
  product_id, quantity, unit_price, amount, notes, sort_order)
VALUES
  -- DRN-1: 価格記載あり — 単価 = 注文請書の受注単価 ¥3,220
  ('dd000000-0000-4000-8000-000000000021'::uuid, '202607', 1, 9001, 30, 3220, 96600, NULL, 0),
  -- DRN-2: 価格記載なし — 単価・金額は NULL（フォームの挙動と同じ）
  ('dd000000-0000-4000-8000-000000000022'::uuid, '202607', 2, 9001, 20, NULL, NULL, NULL, 0)
ON CONFLICT (id) DO NOTHING;

-- ── 請求書（INV-202606-00001 — 6月分・発行済）───────────────────────────────
-- 6月出荷 DOR-202606-00001（50×¥3,220）から生成された想定。TAXABLE 10%:
-- 小計 161,000 / 消費税 16,100 / 合計 177,100。支払期限 = 締日 2026-06-30 + 30日。
INSERT INTO app.invoices (year_month, seq, customer_bp_id, customer_branch_bp_id,
  billing_period_from, billing_period_to, subtotal, tax_amount, total_amount,
  status, issued_at, due_date, sent_at, pdf_file_id, yayoi_exported_at, notes,
  created_by, created_at, updated_at)
VALUES
  ('202606', 1, 'd0000000-0000-4000-8000-000000000001'::uuid, NULL,
   '2026-06-01', '2026-06-30', 161000, 16100, 177100,
   'ISSUED'::app."INVOICE_STATUS", '2026-07-01T09:00:00+09', '2026-07-30', NULL, NULL, NULL, NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-01T09:00:00+09', '2026-07-01T09:00:00+09')
ON CONFLICT (year_month, seq) DO NOTHING;

-- 明細: 由来 = DOR-202606-00001（この参照が 6月出荷を「請求済み」にする。
-- 7月出荷 DOR-202607-00001 はどの明細からも未参照 → 7月締めの未請求対象に残る）
INSERT INTO app.invoice_items (id, invoice_year_month, invoice_seq,
  delivery_order_year_month, delivery_order_seq, delivery_note_year_month, delivery_note_seq,
  description, quantity, unit_price, amount, sort_order)
VALUES
  ('dd000000-0000-4000-8000-000000000031'::uuid, '202606', 1,
   '202606', 1, NULL, NULL,
   '{"ja": "超硬エンドミル 4枚刃 φ6×60", "en": "Carbide end mill 4FL φ6×60"}'::jsonb,
   50, 3220, 161000, 0)
ON CONFLICT (id) DO NOTHING;

-- ── 締日処理 ────────────────────────────────────────────────────────────────
-- 7月: PENDING（未処理）— 対象出荷はライブ計算で DOR-202607-00001 のみ（30×¥3,220 = ¥96,600）
-- 6月: PROCESSED（処理済）— INV-202606-00001 へのリンク付き（生成請求書リンクの実例）
-- 冪等アービタは unique (customer_bp_id, closing_date) — アプリの締日バッチが
-- 同一ペアを upsert しても衝突しない。
INSERT INTO app.billing_closings (id, customer_bp_id, closing_date, status, total_amount,
  invoice_year_month, invoice_seq, processed_at, processed_by, notes, created_at)
VALUES
  ('dd000000-0000-4000-8000-000000000041'::uuid,
   'd0000000-0000-4000-8000-000000000001'::uuid, '2026-07-31',
   'PENDING'::app."CLOSING_STATUS", 96600,
   NULL, NULL, NULL, NULL, NULL, '2026-07-14T06:10:00+09'),
  ('dd000000-0000-4000-8000-000000000042'::uuid,
   'd0000000-0000-4000-8000-000000000001'::uuid, '2026-06-30',
   'PROCESSED'::app."CLOSING_STATUS", 161000,
   '202606', 1, '2026-07-01T09:00:00+09',
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, NULL, '2026-06-30T06:10:00+09')
ON CONFLICT (customer_bp_id, closing_date) DO NOTHING;

COMMIT;
