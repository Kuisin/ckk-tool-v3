-- masters-demo-seed.sql — マスタアプリ（MS01〜MS0E）のマニュアル撮影用デモデータ。
--
-- tools/docs-screenshots のローカル一時 DB に流す（orchestrate.ts SEED_FILES_POST）。
-- sales-demo-seed.sql の「後」に適用する前提（デモ商事 BP-90001 =
-- d0000000-0000-4000-8000-000000000001 を参照する — 行の変更はしない）。
--
-- 公開マニュアルのスクリーンショットに実在の取引先名を写さないため、架空の
-- 仕入先・外注先・最終需要家（デモ〜株式会社 BP-90003〜90005）を専用に作成する。
--
-- 冪等: 全行固定 UUID（da______-…）/ 固定コード + ON CONFLICT。日付は 2026-07 固定 —
-- 撮り直し（docs:verify）でピクセルが変わらないよう「今日」に依存する値を持たない
-- （now() は feature_flags.updated_at のみ — 画面に出ない）。
-- serial PK のテーブルは一意コードで冪等化し、FK は SELECT-by-code で解決する
-- （検査表テンプレートのみ固定 id + setval — 明細 FK を決定的にするため）。
-- 前提: マイグレーション済み（拠点 F01 / 工程カタログ / 不良種類 / 採番構成マスタは
--        migration でシード済み — ここでは重複シードしない）。

BEGIN;

-- ── 撮影用フラグ ────────────────────────────────────────────────────────────
-- 撮影は APP_ENV=main で行うため、main 未公開のマスタアプリを撮影 DB に限り
-- 明示有効化する（本番の feature-flags-seed.sql には影響しない）。
-- MS01〜MS05・MS0B（承認グループ）は feature-flags-seed.sql で有効化済み。
INSERT INTO app.feature_flags (key, is_enabled, description, updated_at) VALUES
  ('app:master-materials:main',            true, '素材（マニュアル撮影用）',             now()),
  ('app:master-suppliers:main',            true, '外注企業（マニュアル撮影用）',         now()),
  ('app:master-process-steps:main',        true, '工程マスタ（マニュアル撮影用）',       now()),
  ('app:master-inspection-templates:main', true, '検査表テンプレート（マニュアル撮影用）', now()),
  ('app:master-defect-types:main',         true, '不良種類（マニュアル撮影用）',         now()),
  ('app:master-plants:main',               true, '拠点（マニュアル撮影用）',             now()),
  ('app:master-material-numbering:main',   true, '採番構成（マニュアル撮影用）',         now()),
  ('app:master-work-locations:main',       true, '作業場所（マニュアル撮影用）',         now()),
  ('app:master-storage-locations:main',    true, '保管場所（マニュアル撮影用）',         now())
ON CONFLICT (key) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled, updated_at = now();

-- ── 架空 BP（仕入先・外注先・最終需要家）────────────────────────────────────
INSERT INTO app.business_partners (id, bp_code, name, name_kana, short_name, country_code,
  postal_code, address, phone, fax, email, match_names, is_active, notes, created_at, updated_at)
VALUES
  ('da000000-0000-4000-8000-000000000003'::uuid, 'BP-90003',
   '{"ja": "デモ精密材料株式会社", "en": "Demo Precision Materials Co., Ltd."}'::jsonb,
   'デモセイミツザイリョウ', 'デモ精密材料', 'JP',
   '460-0002', '{"ja": "愛知県名古屋市中区丸の内1-2-3", "en": "1-2-3 Marunouchi, Naka-ku, Nagoya, Aichi"}'::jsonb,
   '052-000-0001', '052-000-0002', 'sales@demo-materials.example.co.jp',
   ARRAY['デモ精密材料株式会社', 'デモ精密材料']::text[],
   true, NULL, '2026-07-01T09:20:00+09', '2026-07-01T09:20:00+09'),
  ('da000000-0000-4000-8000-000000000004'::uuid, 'BP-90004',
   '{"ja": "デモ研磨工業株式会社", "en": "Demo Grinding Industry Co., Ltd."}'::jsonb,
   'デモケンマコウギョウ', 'デモ研磨', 'JP',
   '486-0800', '{"ja": "愛知県春日井市西山町4-5-6", "en": "4-5-6 Nishiyama-cho, Kasugai, Aichi"}'::jsonb,
   '0568-00-0003', NULL, 'info@demo-grinding.example.co.jp',
   ARRAY['デモ研磨工業株式会社', 'デモ研磨工業']::text[],
   true, NULL, '2026-07-01T09:22:00+09', '2026-07-01T09:22:00+09'),
  ('da000000-0000-4000-8000-000000000005'::uuid, 'BP-90005',
   '{"ja": "デモ電子工業株式会社", "en": "Demo Electronics Industry Co., Ltd."}'::jsonb,
   'デモデンシコウギョウ', 'デモ電子', 'JP',
   '222-0033', '{"ja": "神奈川県横浜市港北区新横浜7-8-9", "en": "7-8-9 Shin-Yokohama, Kohoku-ku, Yokohama, Kanagawa"}'::jsonb,
   '045-000-0005', NULL, NULL,
   ARRAY['デモ電子工業株式会社', 'デモ電子工業']::text[],
   true, NULL, '2026-07-01T09:24:00+09', '2026-07-01T09:24:00+09')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.bp_role_assignments (id, bp_id, role, is_active, assigned_at)
VALUES
  ('da100000-0000-4000-8000-000000000003'::uuid, 'da000000-0000-4000-8000-000000000003'::uuid,
   'VENDOR'::app."BP_ROLE",   true, '2026-07-01T09:20:00+09'),
  ('da100000-0000-4000-8000-000000000004'::uuid, 'da000000-0000-4000-8000-000000000004'::uuid,
   'VENDOR'::app."BP_ROLE",   true, '2026-07-01T09:22:00+09'),
  ('da100000-0000-4000-8000-000000000005'::uuid, 'da000000-0000-4000-8000-000000000005'::uuid,
   'END_USER'::app."BP_ROLE", true, '2026-07-01T09:24:00+09')
ON CONFLICT (bp_id, role) DO NOTHING;

-- 仕入先属性（BP-90003: 素材調達）/ 外注先属性（BP-90004: 研磨委託）
INSERT INTO app.bp_vendor_attrs (bp_id, vendor_type, closing_day, payment_terms_days, payment_day,
  bank_name, bank_branch, bank_account_type, bank_account_number, lead_time_days, notes)
VALUES
  ('da000000-0000-4000-8000-000000000003'::uuid, 'SUPPLIER'::app."VENDOR_TYPE",
   31, 60, 31, 'デモ銀行', '名古屋支店', '普通', '1234567', 7, '超硬素材の定常仕入先（デモ）'),
  ('da000000-0000-4000-8000-000000000004'::uuid, 'OUTSOURCE'::app."VENDOR_TYPE",
   20, 30, 10, 'デモ銀行', '春日井支店', '当座', '7654321', 14, 'センタレス研磨の外注先（デモ）')
ON CONFLICT (bp_id) DO NOTHING;

-- 需要家属性（BP-90005）
INSERT INTO app.bp_end_user_attrs (bp_id, industry, notes)
VALUES ('da000000-0000-4000-8000-000000000005'::uuid, '電子部品', '基板加工用工具の最終ユーザー（デモ）')
ON CONFLICT (bp_id) DO NOTHING;

-- 既存の架空顧客 デモ商事（sales-demo-seed.sql の BP-90001）に取引条件を付与 —
-- 顧客詳細の「取引条件」欄が空にならないようにする（既存行があれば触らない）。
INSERT INTO app.bp_customer_attrs (bp_id, closing_day, payment_terms_days, payment_day,
  credit_limit, tax_type, invoice_method, is_consignment, notes)
VALUES ('d0000000-0000-4000-8000-000000000001'::uuid, 31, 30, 31,
  5000000, 'TAXABLE'::app."TAX_TYPE", 'EMAIL'::app."INVOICE_METHOD", false, NULL)
ON CONFLICT (bp_id) DO NOTHING;

-- ── 地域・拠点 ──────────────────────────────────────────────────────────────
-- F01 本社工場は migration（20260714110000）でシード済み — ここでは追加しない。
INSERT INTO app.regions (code, name, is_active, created_at, updated_at)
VALUES ('R01', '{"ja": "関東", "en": "Kanto"}'::jsonb, true,
  '2026-07-01T09:30:00+09', '2026-07-01T09:30:00+09')
ON CONFLICT (code) DO NOTHING;

INSERT INTO app.plants (code, name, name_kana, country_code, region_id, postal_code, address,
  phone, is_active, notes, created_at, updated_at)
VALUES ('F02', '{"ja": "第二工場", "en": "Second factory"}'::jsonb, 'だいにこうじょう', 'JP',
  (SELECT id FROM app.regions WHERE code = 'R01'),
  '350-1101', '{"ja": "埼玉県川越市的場10-11-12", "en": "10-11-12 Matoba, Kawagoe, Saitama"}'::jsonb,
  '049-000-0006', true, 'コーティング・出荷拠点（デモ）',
  '2026-07-01T09:32:00+09', '2026-07-01T09:32:00+09')
ON CONFLICT (code) DO NOTHING;

-- 既存拠点（F01/F02）を関東地域へ割当（未割当のときのみ — 冪等）
UPDATE app.plants
SET region_id = (SELECT id FROM app.regions WHERE code = 'R01')
WHERE code IN ('F01', 'F02') AND region_id IS NULL;

-- ── 保管場所 + 棚（MS0E — F01 本社工場）────────────────────────────────────
-- フロアマップピン（floor_map_id/map_x/map_y）は未配置のまま（マップ画像は
-- SeaweedFS が必要なため撮影ではマップ空状態を撮る）。
INSERT INTO app.storage_locations (plant_id, code, name, sort_order, is_active, notes, created_at, updated_at)
VALUES
  ((SELECT id FROM app.plants WHERE code = 'F01'), 'WH1',
   '{"ja": "資材倉庫A", "en": "Material warehouse A"}'::jsonb, 0, true, '素材受入後の保管棚',
   '2026-07-01T10:00:00+09', '2026-07-01T10:00:00+09'),
  ((SELECT id FROM app.plants WHERE code = 'F01'), 'WH2',
   '{"ja": "製品棚B", "en": "Product rack B"}'::jsonb, 1, true, '完成品の出荷前保管',
   '2026-07-01T10:02:00+09', '2026-07-01T10:02:00+09'),
  ((SELECT id FROM app.plants WHERE code = 'F01'), 'WH3',
   '{"ja": "出荷前置場", "en": "Pre-shipment area"}'::jsonb, 2, true, NULL,
   '2026-07-01T10:04:00+09', '2026-07-01T10:04:00+09')
ON CONFLICT (code) DO NOTHING;

INSERT INTO app.storage_shelves (location_id, code, name, sort_order, is_active)
VALUES
  ((SELECT id FROM app.storage_locations WHERE code = 'WH1'), 'A-1', '{"ja": "A-1", "en": "A-1"}'::jsonb, 0, true),
  ((SELECT id FROM app.storage_locations WHERE code = 'WH1'), 'A-2', '{"ja": "A-2", "en": "A-2"}'::jsonb, 1, true),
  ((SELECT id FROM app.storage_locations WHERE code = 'WH1'), 'A-3', '{"ja": "A-3", "en": "A-3"}'::jsonb, 2, true),
  ((SELECT id FROM app.storage_locations WHERE code = 'WH2'), 'B-1', '{"ja": "B-1", "en": "B-1"}'::jsonb, 0, true),
  ((SELECT id FROM app.storage_locations WHERE code = 'WH2'), 'B-2', '{"ja": "B-2", "en": "B-2"}'::jsonb, 1, true)
ON CONFLICT (location_id, code) DO NOTHING;

-- ── 作業場所グループ + 作業場所（MS0D — F01 本社工場）──────────────────────
-- type_key は組み込み種別（machine / area — lib/work-locations.ts）を使用。
INSERT INTO app.work_location_groups (code, name, type_key, plant_id, sort_order, is_active, notes, created_at, updated_at)
VALUES
  ('CUTTING', '{"ja": "切削エリア", "en": "Cutting area"}'::jsonb, 'machine',
   (SELECT id FROM app.plants WHERE code = 'F01'), 0, true, 'NC旋盤・マシニング（デモ）',
   '2026-07-01T10:10:00+09', '2026-07-01T10:10:00+09'),
  ('GRINDING', '{"ja": "研磨エリア", "en": "Grinding area"}'::jsonb, 'area',
   (SELECT id FROM app.plants WHERE code = 'F01'), 1, true, NULL,
   '2026-07-01T10:12:00+09', '2026-07-01T10:12:00+09')
ON CONFLICT (code) DO NOTHING;

INSERT INTO app.work_locations (group_id, code, name, capacity, sort_order, is_active, created_at, updated_at)
VALUES
  ((SELECT id FROM app.work_location_groups WHERE code = 'CUTTING'), 'NC-01',
   '{"ja": "NC旋盤 1号機", "en": "NC lathe #1"}'::jsonb, 1, 0, true,
   '2026-07-01T10:10:00+09', '2026-07-01T10:10:00+09'),
  ((SELECT id FROM app.work_location_groups WHERE code = 'CUTTING'), 'NC-02',
   '{"ja": "NC旋盤 2号機", "en": "NC lathe #2"}'::jsonb, 1, 1, true,
   '2026-07-01T10:10:00+09', '2026-07-01T10:10:00+09'),
  ((SELECT id FROM app.work_location_groups WHERE code = 'CUTTING'), 'MC-01',
   '{"ja": "マシニング 1号機", "en": "Machining center #1"}'::jsonb, 1, 2, true,
   '2026-07-01T10:10:00+09', '2026-07-01T10:10:00+09'),
  ((SELECT id FROM app.work_location_groups WHERE code = 'GRINDING'), 'GR-01',
   '{"ja": "研磨機 1号機", "en": "Grinder #1"}'::jsonb, 1, 0, true,
   '2026-07-01T10:12:00+09', '2026-07-01T10:12:00+09'),
  ((SELECT id FROM app.work_location_groups WHERE code = 'GRINDING'), 'GR-02',
   '{"ja": "研磨機 2号機", "en": "Grinder #2"}'::jsonb, 2, 1, true,
   '2026-07-01T10:12:00+09', '2026-07-01T10:12:00+09')
ON CONFLICT (code) DO NOTHING;

-- ── 検査表テンプレート（MS09 — DEMO-INS-01 v1/v2）──────────────────────────
-- 固定 id（9101/9102, 項目 9111〜/9121〜）+ setval — 項目 FK と撮影パスを決定的に
-- する。v2 が最新（型付き項目 4 件・抜取 5 本）、v1 は旧版（バージョンタブ表示用。
-- ロック表示は指示書/検査記録の参照で決まるため、未参照の v1 は「未使用」表示）。
INSERT INTO app.inspection_templates (id, code, version, name, related_process_step_id,
  sampling_mode, sampling_value, record_style, is_active, created_at, updated_at)
VALUES
  (9101, 'DEMO-INS-01', 1, '{"ja": "寸法検査（デモ）", "en": "Dimensional inspection (demo)"}'::jsonb,
   (SELECT id FROM app.process_step_catalog WHERE code = 'FAB_INSPECTION'),
   'ALL'::app."InspectionSamplingMode", NULL, 'VALUES'::app."InspectionRecordStyle", true,
   '2026-07-01T11:00:00+09', '2026-07-01T11:00:00+09'),
  (9102, 'DEMO-INS-01', 2, '{"ja": "寸法検査（デモ）", "en": "Dimensional inspection (demo)"}'::jsonb,
   (SELECT id FROM app.process_step_catalog WHERE code = 'FAB_INSPECTION'),
   'COUNT'::app."InspectionSamplingMode", 5, 'VALUES'::app."InspectionRecordStyle", true,
   '2026-07-05T14:00:00+09', '2026-07-05T14:00:00+09')
ON CONFLICT DO NOTHING; -- 再実行時は id / (code, version) いずれの衝突でもスキップ

SELECT setval(pg_get_serial_sequence('app.inspection_templates', 'id'),
              GREATEST((SELECT MAX(id) FROM app.inspection_templates), 9102));

INSERT INTO app.inspection_template_items (id, template_id, item_name, input_type, unit,
  tolerance_min, tolerance_max, options, accept_bool, accept_options, goal_value,
  allow_manual_override, is_required, sort_order)
VALUES
  -- v1（旧版）: 数値 2 項目のみ
  (9111, 9101, '{"ja": "外径", "en": "Outer diameter"}'::jsonb, 'NUMBER'::app."InspectionItemType",
   'mm', 5.98, 6.02, NULL, NULL, NULL, NULL, true, true, 10),
  (9112, 9101, '{"ja": "全長", "en": "Overall length"}'::jsonb, 'NUMBER'::app."InspectionItemType",
   'mm', 59.9, 60.1, NULL, NULL, NULL, NULL, true, true, 20),
  -- v2（最新）: 数値（合格範囲 + 目標値）/ 真偽 / 単一選択
  (9121, 9102, '{"ja": "外径", "en": "Outer diameter"}'::jsonb, 'NUMBER'::app."InspectionItemType",
   'mm', 5.98, 6.02, NULL, NULL, NULL, '6.0'::jsonb, true, true, 10),
  (9122, 9102, '{"ja": "全長", "en": "Overall length"}'::jsonb, 'NUMBER'::app."InspectionItemType",
   'mm', 59.9, 60.1, NULL, NULL, NULL, '60'::jsonb, true, true, 20),
  (9123, 9102, '{"ja": "外観にキズがないこと", "en": "No visible scratches"}'::jsonb, 'BOOLEAN'::app."InspectionItemType",
   NULL, NULL, NULL, NULL, true, NULL, NULL, true, true, 30),
  (9124, 9102, '{"ja": "表面仕上げ", "en": "Surface finish"}'::jsonb, 'SELECT_SINGLE'::app."InspectionItemType",
   NULL, NULL, NULL,
   '[{"value": "good", "label": {"ja": "良", "en": "Good"}},
     {"value": "fair", "label": {"ja": "可", "en": "Fair"}},
     {"value": "poor", "label": {"ja": "不可", "en": "Poor"}}]'::jsonb,
   NULL, '["good", "fair"]'::jsonb, '"good"'::jsonb, true, false, 40)
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('app.inspection_template_items', 'id'),
              GREATEST((SELECT MAX(id) FROM app.inspection_template_items), 9124));

COMMIT;

-- ── 決定性: migration シードの now() タイムスタンプを固定 ────────────────────
-- 材種・採番構成・拠点などの一覧は「更新日」列を表示する。migration が刻む
-- now() は DB 再構築のたびに変わり docs:verify の pixel 比較を壊すため、
-- 撮影 DB では全マスタ行の作成/更新日時を固定値に揃える（冪等・無害）。
BEGIN;
UPDATE app.material_manufacturers        SET created_at='2026-07-01T09:00:00+09', updated_at='2026-07-01T09:00:00+09';
UPDATE app.material_manufacturer_grades  SET created_at='2026-07-01T09:00:00+09', updated_at='2026-07-01T09:00:00+09';
UPDATE app.material_shapes               SET created_at='2026-07-01T09:00:00+09', updated_at='2026-07-01T09:00:00+09';
UPDATE app.material_kinds                SET created_at='2026-07-01T09:00:00+09', updated_at='2026-07-01T09:00:00+09';
UPDATE app.material_surface_finishes     SET created_at='2026-07-01T09:00:00+09', updated_at='2026-07-01T09:00:00+09';
UPDATE app.material_diameters            SET created_at='2026-07-01T09:00:00+09', updated_at='2026-07-01T09:00:00+09';
UPDATE app.material_length_variants      SET created_at='2026-07-01T09:00:00+09', updated_at='2026-07-01T09:00:00+09';
UPDATE app.material_types                SET created_at='2026-07-01T09:00:00+09', updated_at='2026-07-01T09:00:00+09';
UPDATE app.material_type_prices          SET created_at='2026-07-01T09:00:00+09', updated_at='2026-07-01T09:00:00+09';
UPDATE app.materials                     SET created_at='2026-07-01T09:00:00+09', updated_at='2026-07-01T09:00:00+09';
UPDATE app.plants                        SET created_at='2026-07-01T09:00:00+09', updated_at='2026-07-01T09:00:00+09'
  WHERE updated_at > '2026-07-31T00:00:00+09';
COMMIT;
