-- sales-demo-seed.sql — 販売アプリ（SA02〜SA01）のマニュアル撮影用デモデータ。
--
-- tools/docs-screenshots のローカル一時 DB に流す（orchestrate.ts SEED_FILES_POST）。
-- 公開マニュアルのスクリーンショットに実在の取引先名を写さないため、架空の顧客
-- 「デモ商事株式会社」を専用に作成する（レガシー BP import には依存しない）。
--
-- 冪等: 全行固定 UUID / 固定日付 + ON CONFLICT。日付は 2026-07 固定 —
-- 撮り直し（docs:verify）でピクセルが変わらないよう「今日」に依存する値を持たない。
-- 前提: マイグレーション済み（材種・直径・黒皮/研磨マスタは migration でシード済み）
--        + screenshot-user-seed.sql（demo_shot ユーザー）適用済み。

BEGIN;

-- ── 撮影用フラグ ────────────────────────────────────────────────────────────
-- 撮影は APP_ENV=main（本番相当の見た目）で行うため、main 未公開の販売アプリ
-- （注文請書・設計依頼書・設計図）を撮影 DB に限り明示有効化する。本番の
-- feature-flags-seed.sql には影響しない。
INSERT INTO app.feature_flags (key, is_enabled, description, updated_at) VALUES
  ('app:order-acceptances:main', true, '注文請書（マニュアル撮影用）', now()),
  ('app:design-requests:main',   true, '設計依頼書（マニュアル撮影用）', now()),
  -- 設計図 (PD06) は設計依頼とセット — 依頼の完了に成果物の版が要るので、
  -- 片方だけ有効にすると完了操作が撮れない。
  ('app:design-files:main',      true, '設計図（マニュアル撮影用）', now())
ON CONFLICT (key) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled, updated_at = now();

-- ── 架空顧客（BP）───────────────────────────────────────────────────────────
INSERT INTO app.business_partners (id, bp_code, name, name_kana, match_names, is_active, created_at, updated_at)
VALUES
  ('d0000000-0000-4000-8000-000000000001'::uuid, 'BP-90001',
   '{"ja": "デモ商事株式会社", "en": "Demo Trading Co., Ltd."}'::jsonb,
   'デモショウジ', ARRAY['デモ商事株式会社', 'デモ商事']::text[],
   true, '2026-07-01T09:00:00+09', '2026-07-01T09:00:00+09'),
  ('d0000000-0000-4000-8000-000000000002'::uuid, 'BP-90002',
   '{"ja": "デモ商事株式会社 大阪支店", "en": "Demo Trading Co., Ltd. Osaka Branch"}'::jsonb,
   'デモショウジ オオサカシテン', ARRAY[]::text[],
   true, '2026-07-01T09:00:00+09', '2026-07-01T09:00:00+09')
ON CONFLICT (id) DO NOTHING;

UPDATE app.business_partners
SET parent_id = 'd0000000-0000-4000-8000-000000000001'::uuid
WHERE id = 'd0000000-0000-4000-8000-000000000002'::uuid AND parent_id IS NULL;

INSERT INTO app.bp_role_assignments (bp_id, role)
VALUES
  ('d0000000-0000-4000-8000-000000000001'::uuid, 'CUSTOMER'::app."BP_ROLE"),
  ('d0000000-0000-4000-8000-000000000002'::uuid, 'CUSTOMER'::app."BP_ROLE")
ON CONFLICT (bp_id, role) DO NOTHING;

-- ── 製品（PRD-202607-0001〜0003）────────────────────────────────────────────
INSERT INTO app.products (id, year_month, seq, name, material_type_id, diameter_mm, length_mm, unit, is_active, created_at, updated_at)
VALUES
  (9001, '202607', 1, '{"ja": "超硬エンドミル 4枚刃 φ6×60", "en": "Carbide end mill 4FL φ6×60"}'::jsonb,
   (SELECT id FROM app.material_types WHERE code = 'B01A0001'), 6.0, 60.0, '本', true,
   '2026-07-01T09:10:00+09', '2026-07-01T09:10:00+09'),
  (9002, '202607', 2, '{"ja": "超硬ドリル 2枚刃 φ4×50", "en": "Carbide drill 2FL φ4×50"}'::jsonb,
   (SELECT id FROM app.material_types WHERE code = 'B04A0001'), 4.0, 50.0, '本', true,
   '2026-07-01T09:12:00+09', '2026-07-01T09:12:00+09'),
  (9003, '202607', 3, '{"ja": "超硬リーマ φ8×70", "en": "Carbide reamer φ8×70"}'::jsonb,
   (SELECT id FROM app.material_types WHERE code = 'B01A0001'), 8.0, 70.0, '本', true,
   '2026-07-01T09:14:00+09', '2026-07-01T09:14:00+09')
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('app.products', 'id'),
              GREATEST((SELECT MAX(id) FROM app.products), 9003));

-- ── 試算（EST-202607-00001〜00003）──────────────────────────────────────────
-- input は TrialEstimateForm が保存する TrialInput と同形（result は NULL —
-- 表示側が input から再計算する。設定・データ固定なので決定的）。
INSERT INTO app.estimates (year_month, seq, name, tool_type, status, customer_bp_id, product_id,
  material_type_id, diameter_code, surface_finish_code,
  reference_unit_price, reference_date, reference_overridden, input, result, registered_at,
  created_by, created_at, updated_at)
VALUES
  ('202607', 1, 'エンドミル φ6×60 CX400', 'ROUND_BAR', 'REGISTERED',
   'd0000000-0000-4000-8000-000000000001'::uuid, 9001,
   (SELECT id FROM app.material_types WHERE code = 'B01A0001'), '060', 'B',
   8016.13, '2026-07-01', false,
   '{"toolType": "ROUND_BAR", "maxDiameter": 6, "totalLength": 60, "materialBarPrice": 8016.13,
     "isBlackSkin": false, "cylinderMaterialPrice": 13086, "cylinderType": "NORMAL",
     "stepLength": 9, "stepType": "FINISH", "neckLength": 0, "neckType": "NONE",
     "coating": "CX400", "lapType": "NONE", "inspection": "NONE",
     "ldEnabled": false, "ldLocation": "TIP", "ldOuterDiameter": 3, "ldBladeLength": 10,
     "machiningMinutes": 6, "machiningRatePer10min": 2000, "spareShapeCount": 3,
     "lotQuantities": [100, 0, 0], "lotMarkups": [1]}'::jsonb,
   NULL, '2026-07-03T10:00:00+09',
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-02T09:30:00+09', '2026-07-03T10:00:00+09'),
  ('202607', 2, 'ドリル φ4×50 ノンコート', 'ROUND_BAR', 'CONFIRMED',
   'd0000000-0000-4000-8000-000000000001'::uuid, 9002,
   (SELECT id FROM app.material_types WHERE code = 'B04A0001'), '040', 'B',
   4306.45, '2026-07-01', false,
   '{"toolType": "ROUND_BAR", "maxDiameter": 4, "totalLength": 50, "materialBarPrice": 4306.45,
     "isBlackSkin": false, "cylinderMaterialPrice": 13086, "cylinderType": "NORMAL",
     "stepLength": 0, "stepType": "NONE", "neckLength": 0, "neckType": "NONE",
     "coating": "無", "lapType": "NONE", "inspection": "NONE",
     "ldEnabled": false, "ldLocation": "TIP", "ldOuterDiameter": 3, "ldBladeLength": 10,
     "machiningMinutes": 5, "machiningRatePer10min": 2000, "spareShapeCount": 3,
     "lotQuantities": [100, 0, 0], "lotMarkups": [1]}'::jsonb,
   NULL, NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-02T11:00:00+09', '2026-07-02T14:00:00+09'),
  ('202607', 3, 'リーマ φ8×70（検討中）', 'ROUND_BAR', 'DRAFT',
   'd0000000-0000-4000-8000-000000000001'::uuid, NULL,
   (SELECT id FROM app.material_types WHERE code = 'B01A0001'), '080', 'B',
   12609.68, '2026-07-01', false,
   '{"toolType": "ROUND_BAR", "maxDiameter": 8, "totalLength": 70, "materialBarPrice": 12609.68,
     "isBlackSkin": false, "cylinderMaterialPrice": 13086, "cylinderType": "NORMAL",
     "stepLength": 12, "stepType": "ROUGH", "neckLength": 0, "neckType": "NONE",
     "coating": "無", "lapType": "NONE", "inspection": "ONE",
     "ldEnabled": false, "ldLocation": "TIP", "ldOuterDiameter": 3, "ldBladeLength": 10,
     "machiningMinutes": 8, "machiningRatePer10min": 2000, "spareShapeCount": 3,
     "lotQuantities": [100, 0, 0], "lotMarkups": [1]}'::jsonb,
   NULL, NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-04T15:20:00+09', '2026-07-04T15:20:00+09')
ON CONFLICT (year_month, seq) DO NOTHING;

-- ── 価格表（PRC-202607-00001: デモ商事 × エンドミル φ6×60）──────────────────
INSERT INTO app.price_list_entries (year_month, seq, customer_bp_id, product_id, currency, is_active,
  created_by, created_at, updated_at)
VALUES ('202607', 1, 'd0000000-0000-4000-8000-000000000001'::uuid, 9001, 'JPY', true,
  'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-03T10:00:00+09', '2026-07-03T10:00:00+09')
ON CONFLICT (year_month, seq) DO NOTHING;

INSERT INTO app.price_list_variants (id, entry_year_month, entry_seq, order_type, base_unit_price,
  valid_from, valid_until, estimate_year_month, estimate_seq, is_active, created_at, updated_at)
VALUES
  ('d1000000-0000-4000-8000-000000000001'::uuid, '202607', 1, 'PRODUCTION'::app."ORDER_TYPE",
   3220, '2026-07-01', NULL, '202607', 1, true, '2026-07-03T10:00:00+09', '2026-07-03T10:00:00+09'),
  ('d1000000-0000-4000-8000-000000000002'::uuid, '202607', 1, 'TEST'::app."ORDER_TYPE",
   3000, '2026-07-01', '2026-12-31', NULL, NULL, true, '2026-07-03T10:00:00+09', '2026-07-03T10:00:00+09')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.price_list_tiers (id, variant_id, min_quantity, max_quantity, multiplier, price_override, sort_order)
VALUES
  ('d2000000-0000-4000-8000-000000000001'::uuid, 'd1000000-0000-4000-8000-000000000001'::uuid, 1, 49, 1.05, NULL, 0),
  ('d2000000-0000-4000-8000-000000000002'::uuid, 'd1000000-0000-4000-8000-000000000001'::uuid, 50, 99, 1.00, NULL, 1),
  ('d2000000-0000-4000-8000-000000000003'::uuid, 'd1000000-0000-4000-8000-000000000001'::uuid, 100, NULL, 0.95, NULL, 2),
  ('d2000000-0000-4000-8000-000000000004'::uuid, 'd1000000-0000-4000-8000-000000000002'::uuid, 1, NULL, 1.00, NULL, 0)
ON CONFLICT (id) DO NOTHING;

-- 値引きルール（無期限 — 撮り直し時期に依存しない）
INSERT INTO app.price_list_discounts (id, variant_id, label, discount_type, value,
  min_quantity, max_quantity, valid_from, valid_until, is_active, created_at)
VALUES ('d3000000-0000-4000-8000-000000000001'::uuid, 'd1000000-0000-4000-8000-000000000001'::uuid,
  '夏季キャンペーン', 'RATE'::app."PRICE_DISCOUNT_TYPE", 5, 100, NULL, '2026-07-01', NULL, true,
  '2026-07-03T10:05:00+09')
ON CONFLICT (id) DO NOTHING;

-- ── 見積書（QOT-202607-00001〜00002）────────────────────────────────────────
INSERT INTO app.quotes (year_month, seq, customer_bp_id, customer_branch_bp_id, status, valid_until,
  notes, created_by, created_at, updated_at)
VALUES
  ('202607', 1, 'd0000000-0000-4000-8000-000000000001'::uuid, NULL, 'ISSUED'::app."QUOTE_STATUS",
   '2026-09-30', NULL, 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-03T11:00:00+09', '2026-07-03T13:00:00+09'),
  ('202607', 2, 'd0000000-0000-4000-8000-000000000001'::uuid, NULL, 'DRAFT'::app."QUOTE_STATUS",
   NULL, NULL, 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-04T16:00:00+09', '2026-07-04T16:00:00+09')
ON CONFLICT (year_month, seq) DO NOTHING;

INSERT INTO app.quote_items (id, quote_year_month, quote_seq, product_id, order_type, quantity,
  unit_price, price_list_tier_id, discount_amount, discount_label, amount, delivery_date, sort_order)
VALUES
  ('d4000000-0000-4000-8000-000000000001'::uuid, '202607', 1, 9001, 'PRODUCTION'::app."ORDER_TYPE",
   50, 3220, 'd2000000-0000-4000-8000-000000000002'::uuid, 0, NULL, 161000, '2026-08-20', 0),
  ('d4000000-0000-4000-8000-000000000002'::uuid, '202607', 1, 9001, 'TEST'::app."ORDER_TYPE",
   10, 3000, 'd2000000-0000-4000-8000-000000000004'::uuid, 0, NULL, 30000, NULL, 1),
  ('d4000000-0000-4000-8000-000000000003'::uuid, '202607', 2, 9001, 'PRODUCTION'::app."ORDER_TYPE",
   100, 3059, 'd2000000-0000-4000-8000-000000000003'::uuid, 16100, '夏季キャンペーン（5%）',
   289800, '2026-09-10', 0)
ON CONFLICT (id) DO NOTHING;

-- ── 取込元ファイル（メタデータのみ — 実体は撮影では開かない）────────────────
INSERT INTO app.files (id, storage_key, filename, mime_type, size_bytes, created_at)
VALUES
  ('d5000000-0000-4000-8000-000000000001'::uuid, 'demo/intake/order-20260701.pdf',
   '注文書_デモ商事_20260701.pdf', 'application/pdf', 245123, '2026-07-01T10:00:00+09'),
  ('d5000000-0000-4000-8000-000000000002'::uuid, 'demo/intake/order-20260706.pdf',
   '注文書_デモ商事_20260706.pdf', 'application/pdf', 198456, '2026-07-06T08:30:00+09'),
  ('d5000000-0000-4000-8000-000000000003'::uuid, 'demo/design/dwg-v1.pdf',
   '設計図面_PRD-202607-0001_v1.pdf', 'application/pdf', 512000, '2026-07-03T14:00:00+09'),
  ('d5000000-0000-4000-8000-000000000004'::uuid, 'demo/design/dwg-v2.pdf',
   '設計図面_PRD-202607-0001_v2.pdf', 'application/pdf', 524288, '2026-07-06T15:00:00+09'),
  -- 設計図 (PD06) の撮影用 — 顧客専用の系列と、進行中依頼の成果物。
  ('d5000000-0000-4000-8000-000000000005'::uuid, 'demo/design/dwg-demo-v1.pdf',
   '設計図面_デモ商事仕様_v1.pdf', 'application/pdf', 498176, '2026-07-05T11:00:00+09'),
  ('d5000000-0000-4000-8000-000000000006'::uuid, 'demo/design/dwg-0002-v1.pdf',
   '設計図面_PRD-202607-0002_v1.pdf', 'application/pdf', 476000, '2026-07-09T10:00:00+09')
ON CONFLICT (id) DO NOTHING;

-- ── 注文請書（ORD-202607-00001〜00003）──────────────────────────────────────
INSERT INTO app.order_acceptances (year_month, seq, status, source, source_file_id,
  customer_bp_id, customer_order_ref, order_date, notes, created_by, created_at, updated_at)
VALUES
  ('202607', 1, 'DRAFT'::app."ORDER_ACCEPTANCE_STATUS", 'UPLOAD'::app."INTAKE_SOURCE",
   'd5000000-0000-4000-8000-000000000001'::uuid,
   'd0000000-0000-4000-8000-000000000001'::uuid, 'D-2607-0158', '2026-07-01', NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-01T10:01:00+09', '2026-07-01T10:02:00+09'),
  ('202607', 2, 'APPROVED'::app."ORDER_ACCEPTANCE_STATUS", 'FOLDER'::app."INTAKE_SOURCE",
   'd5000000-0000-4000-8000-000000000002'::uuid,
   'd0000000-0000-4000-8000-000000000001'::uuid, 'D-2607-0163', '2026-07-05', NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-06T08:31:00+09', '2026-07-06T09:10:00+09'),
  ('202607', 3, 'REQUESTED'::app."ORDER_ACCEPTANCE_STATUS", 'MANUAL'::app."INTAKE_SOURCE", NULL,
   'd0000000-0000-4000-8000-000000000001'::uuid, 'D-2607-0170', '2026-07-07', NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-07T13:45:00+09', '2026-07-07T13:50:00+09')
ON CONFLICT (year_month, seq) DO NOTHING;

-- 注文明細。20260907090000_order_lines_merge で order_acceptance_items から
-- order_lines へ改名された（下書きと実行を 1 本にまとめた）。ここは下書き段階の
-- 行なので status は既定の DRAFT、枝番・金額は確定時に入る（NULL のまま）。
INSERT INTO app.order_lines (id, acceptance_year_month, acceptance_seq, product_id,
  product_text, order_type, quantity, unit_price, delivery_date, sort_order)
VALUES
  -- ORD-1: 1行目は価格表（¥3,220）と異なる単価 → 価格差異バッジの実例
  ('d6000000-0000-4000-8000-000000000001'::uuid, '202607', 1, 9001,
   '超硬エンドミル 4枚刃 6mm', 'PRODUCTION'::app."ORDER_TYPE", 50, 3000, '2026-08-20', 0),
  -- ORD-1: 2行目は製品未特定の実例
  ('d6000000-0000-4000-8000-000000000002'::uuid, '202607', 1, NULL,
   '超硬エンドミル 4mm 特殊形状', 'PRODUCTION'::app."ORDER_TYPE", 20, NULL, NULL, 1),
  -- ORD-2: 価格表と一致（1〜49本 ×1.05 = ¥3,381）
  ('d6000000-0000-4000-8000-000000000003'::uuid, '202607', 2, 9001,
   '超硬エンドミル 4枚刃 6mm', 'PRODUCTION'::app."ORDER_TYPE", 30, 3381, '2026-09-01', 0),
  ('d6000000-0000-4000-8000-000000000004'::uuid, '202607', 3, 9002,
   NULL, 'PRODUCTION'::app."ORDER_TYPE", 100, 1850, '2026-09-15', 0)
ON CONFLICT (id) DO NOTHING;

-- ── 設計依頼書（DSG-202607-00001〜00005）────────────────────────────────────
-- sales_order_id は order_line_id へ改名済み（同じ order_lines 統合による）。
-- 承認フロー導入で状態が 7 つになったので、下書き・承認依頼中の行も置いて
-- マニュアルの撮影（承認カード / 承認・作業状況）に被写体があるようにする。
--
-- 依頼区分は「その製品に design_files があるか」で決まる。**保存された値**なので
-- 後から版が増えても動かない（承認ルートが変わってしまうため — design.prisma 参照）。
-- この seed では 9001 が改訂・9002 が新規で、両方の区分が撮影できる。
-- なお DSG-00006 の完了で 9002 にも版が付くが、既存行の区分は保存値のまま。
INSERT INTO app.design_requests (id, request_number, trigger, quote_year_month, quote_seq,
  order_line_id, product_id, description, status, assignee_id,
  kind, change_reason, desired_at, priority,
  requested_at, approved_at, started_at, completed_at, history,
  created_by, created_at, updated_at)
VALUES
  ('d7000000-0000-4000-8000-000000000001'::uuid, 'DSG-202607-00001', 'QUOTE'::app."DESIGN_TRIGGER",
   '202607', 1, NULL, 9001, '先端R0.5 の特殊形状。見積提出前に図面確認をお願いします。',
   'IN_PROGRESS'::app."DESIGN_STATUS", 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   'REVISION'::app."DESIGN_KIND", '先端形状の公差見直しに伴う改訂。', '2026-07-15', 'HIGH'::app."DESIGN_PRIORITY",
   '2026-07-03T14:10:00+09', '2026-07-03T16:00:00+09', '2026-07-04T09:00:00+09', NULL,
   '[{"action":"CREATE","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-03T05:00:00.000Z"},
     {"action":"REQUEST_APPROVAL","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-03T05:10:00.000Z"},
     {"action":"APPROVE","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-03T07:00:00.000Z"},
     {"action":"START","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-04T00:00:00.000Z"}]'::jsonb,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-03T14:00:00+09', '2026-07-04T09:00:00+09'),
  ('d7000000-0000-4000-8000-000000000002'::uuid, 'DSG-202607-00002', 'QUOTE'::app."DESIGN_TRIGGER",
   NULL, NULL, NULL, 9001, '首下逃がし形状の見直し（公差 ±0.005）。',
   'COMPLETED'::app."DESIGN_STATUS", 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   'REVISION'::app."DESIGN_KIND", '首下逃がしの公差を ±0.005 へ。', '2026-07-08', 'NORMAL'::app."DESIGN_PRIORITY",
   '2026-07-02T10:10:00+09', '2026-07-02T13:00:00+09', '2026-07-03T09:00:00+09', '2026-07-06T15:30:00+09',
   '[{"action":"CREATE","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-02T01:00:00.000Z"},
     {"action":"REQUEST_APPROVAL","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-02T01:10:00.000Z"},
     {"action":"APPROVE","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-02T04:00:00.000Z"},
     {"action":"START","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-03T00:00:00.000Z"},
     {"action":"COMPLETE","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-06T06:30:00.000Z"}]'::jsonb,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-02T10:00:00+09', '2026-07-06T15:30:00+09'),
  ('d7000000-0000-4000-8000-000000000003'::uuid, 'DSG-202607-00003', 'SALES_ORDER'::app."DESIGN_TRIGGER",
   NULL, NULL, NULL, 9002, '受注後の治具設計（注文請書確定待ち）。',
   'PENDING'::app."DESIGN_STATUS", 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   'NEW'::app."DESIGN_KIND", NULL, '2026-07-20', 'NORMAL'::app."DESIGN_PRIORITY",
   '2026-07-07T09:10:00+09', '2026-07-07T11:00:00+09', NULL, NULL,
   '[{"action":"CREATE","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-07T00:00:00.000Z"},
     {"action":"REQUEST_APPROVAL","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-07T00:10:00.000Z"},
     {"action":"APPROVE","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-07T02:00:00.000Z"}]'::jsonb,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-07T09:00:00+09', '2026-07-07T09:00:00+09'),
  -- 下書き（承認依頼のカードが出ている状態）
  ('d7000000-0000-4000-8000-000000000004'::uuid, 'DSG-202607-00004', 'QUOTE'::app."DESIGN_TRIGGER",
   NULL, NULL, NULL, 9002, 'テーパ部の面粗さ指定を追加した図面（下書き）。',
   'DRAFT'::app."DESIGN_STATUS", 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   'NEW'::app."DESIGN_KIND", NULL, '2026-07-31', 'NORMAL'::app."DESIGN_PRIORITY",
   NULL, NULL, NULL, NULL,
   '[{"action":"CREATE","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-08T00:00:00.000Z"}]'::jsonb,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-08T09:00:00+09', '2026-07-08T09:00:00+09'),
  -- 承認依頼中（承認 / 差し戻しのカードが出ている状態）
  ('d7000000-0000-4000-8000-000000000005'::uuid, 'DSG-202607-00005', 'SALES_ORDER'::app."DESIGN_TRIGGER",
   NULL, NULL, NULL, 9002, '座ぐり深さ変更に伴う図面改訂（承認待ち）。',
   'REQUESTED'::app."DESIGN_STATUS", 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   'NEW'::app."DESIGN_KIND", NULL, '2026-07-24', 'HIGH'::app."DESIGN_PRIORITY",
   '2026-07-08T13:00:00+09', NULL, NULL, NULL,
   '[{"action":"CREATE","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-08T03:30:00.000Z"},
     {"action":"REQUEST_APPROVAL","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-08T04:00:00.000Z"}]'::jsonb,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-08T12:30:00+09', '2026-07-08T13:00:00+09'),
  -- 進行中で **成果物が登録済み**（= 完了できる状態）。DSG-00001 は同じ進行中でも
  -- 成果物が無いので「図面を登録してください」になる — 2 つ並べて両方を撮る。
  ('d7000000-0000-4000-8000-000000000006'::uuid, 'DSG-202607-00006', 'SALES_ORDER'::app."DESIGN_TRIGGER",
   NULL, NULL, NULL, 9002, 'ドリル先端角の変更（図面登録済み・完了待ち）。',
   'IN_PROGRESS'::app."DESIGN_STATUS", 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   'NEW'::app."DESIGN_KIND", NULL, '2026-07-18', 'NORMAL'::app."DESIGN_PRIORITY",
   '2026-07-08T09:10:00+09', '2026-07-08T11:00:00+09', '2026-07-09T09:00:00+09', NULL,
   '[{"action":"CREATE","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-08T00:00:00.000Z"},
     {"action":"REQUEST_APPROVAL","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-08T00:10:00.000Z"},
     {"action":"APPROVE","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-08T02:00:00.000Z"},
     {"action":"START","user":"a0b1c2d3-0000-4000-8000-000000005107","at":"2026-07-09T00:00:00.000Z"}]'::jsonb,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-08T09:00:00+09', '2026-07-09T09:00:00+09')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.design_files (id, design_request_id, product_id, file_id, version, is_latest, notes,
  created_by, created_at)
VALUES
  ('d8000000-0000-4000-8000-000000000001'::uuid, 'd7000000-0000-4000-8000-000000000002'::uuid, 9001,
   'd5000000-0000-4000-8000-000000000003'::uuid, 1, false, NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-03T14:30:00+09'),
  ('d8000000-0000-4000-8000-000000000002'::uuid, 'd7000000-0000-4000-8000-000000000002'::uuid, 9001,
   'd5000000-0000-4000-8000-000000000004'::uuid, 2, true, '公差修正',
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-06T15:30:00+09')
ON CONFLICT (id) DO NOTHING;

-- 設計図 (PD06) — **系列が 2 本ある状態**を作る。上の 2 版は汎用（customer_bp_id
-- が null）で、こちらはデモ商事専用。同じ製品 9001 に「汎用 v2」と「デモ商事 v1」が
-- 同居し、版が (製品 × 受注元) ごとに数えられていることが一覧・詳細で見える。
--
-- デモ商事の版は依頼を経ない登録（design_request_id = null）なので一覧で「手動」、
-- 9002 の版は DSG-00006 の成果物なので「依頼」と出る — 出どころ列の両方を撮れる。
INSERT INTO app.design_files (id, design_request_id, product_id, customer_bp_id, file_id,
  version, is_latest, role, notes, created_by, created_at)
VALUES
  ('d8000000-0000-4000-8000-000000000003'::uuid, NULL, 9001,
   'd0000000-0000-4000-8000-000000000001'::uuid,
   'd5000000-0000-4000-8000-000000000005'::uuid, 1, true,
   'BLUEPRINT'::app."DESIGN_FILE_ROLE", 'デモ商事向けの首下寸法違い',
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-05T11:30:00+09'),
  -- 進行中の DSG-202607-00006 の成果物。**これがあるから完了できる**
  -- （成果物ゼロの依頼は完了できない — completeDesign）。
  ('d8000000-0000-4000-8000-000000000004'::uuid, 'd7000000-0000-4000-8000-000000000006'::uuid, 9002,
   NULL, 'd5000000-0000-4000-8000-000000000006'::uuid, 1, true,
   'BLUEPRINT'::app."DESIGN_FILE_ROLE", '先端角 140° へ変更',
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-09T10:30:00+09')
ON CONFLICT (id) DO NOTHING;

-- 改訂の元図面は design_files の後でないと張れない（FK）ので、ここで当てる。
UPDATE app.design_requests SET base_design_file_id = 'd8000000-0000-4000-8000-000000000002'::uuid
 WHERE id = 'd7000000-0000-4000-8000-000000000001'::uuid;
UPDATE app.design_requests SET base_design_file_id = 'd8000000-0000-4000-8000-000000000001'::uuid
 WHERE id = 'd7000000-0000-4000-8000-000000000002'::uuid;

COMMIT;
