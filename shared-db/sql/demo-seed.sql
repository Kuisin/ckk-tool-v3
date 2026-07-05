-- Demo seed for the master-data screens (材種 / 素材 / 製品) and the BP
-- customers used by the sales flow (試算 / 価格表 / 見積書). Idempotent
-- (ON CONFLICT DO NOTHING); safe to re-run. Apply with:
--   cd shared-db && pnpm seed:demo        (DATABASE_URL from .env)
--
-- Demo products use a past month (PRD-202606-*) so they can never collide
-- with PRD auto-numbering, which starts fresh each month via
-- sys.numbering_sequences. BP rows use fixed UUIDs so re-runs stay idempotent
-- and cross-references remain stable.

-- ── 顧客 (bp.business_partners + roles + attrs) ──────────────────────
INSERT INTO "app"."business_partners"
  ("id", "bp_code", "name", "name_kana", "short_name", "parent_id", "country_code", "is_active", "created_at", "updated_at") VALUES
  ('11111111-1111-4111-8111-111111111111', 'BP-00001',
   '{"ja":"株式会社ABC製作所","en":"ABC Manufacturing Co., Ltd."}', 'エービーシーセイサクショ', 'ABC製作所',
   NULL, 'JP', true, now(), now()),
  ('11111111-1111-4111-8111-111111111112', 'BP-00001-01',
   '{"ja":"株式会社ABC製作所 東京本社","en":"ABC Manufacturing Tokyo HQ"}', 'エービーシーセイサクショトウキョウホンシャ', '東京本社',
   '11111111-1111-4111-8111-111111111111', 'JP', true, now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'BP-00002',
   '{"ja":"合同会社XYZ工業","en":"XYZ Industries LLC"}', 'エックスワイゼットコウギョウ', 'XYZ工業',
   NULL, 'JP', true, now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'BP-00003',
   '{"ja":"株式会社DEFエンジニアリング","en":"DEF Engineering Inc."}', 'ディーイーエフエンジニアリング', 'DEF',
   NULL, 'JP', true, now(), now())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "app"."bp_role_assignments" ("id", "bp_id", "role", "is_active", "assigned_at") VALUES
  ('aaaaaaa1-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'CUSTOMER', true, now()),
  ('aaaaaaa1-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'CUSTOMER', true, now()),
  ('aaaaaaa1-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 'CUSTOMER', true, now())
ON CONFLICT ("bp_id", "role") DO NOTHING;

INSERT INTO "app"."bp_customer_attrs" ("bp_id", "customer_code", "closing_day", "payment_terms_days", "payment_day", "tax_type", "invoice_method") VALUES
  ('11111111-1111-4111-8111-111111111111', 'C-001', 31, 30, 31, 'TAXABLE', 'EMAIL'),
  ('22222222-2222-4222-8222-222222222222', 'C-002', 20, 60, 10, 'TAXABLE', 'FAX'),
  ('33333333-3333-4333-8333-333333333333', 'C-003', 31, 30, 31, 'TAXABLE', 'EMAIL')
ON CONFLICT ("bp_id") DO NOTHING;

INSERT INTO "app"."bp_contacts" ("id", "bp_id", "name", "department", "email", "is_primary", "is_active", "created_at", "updated_at") VALUES
  ('bbbbbbb1-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   '佐藤 健一', '購買部', 'sato@abc-mfg.example.co.jp', true, true, now(), now())
ON CONFLICT ("id") DO NOTHING;

-- ── 需要家 (END_USER role + bp_end_user_attrs) ───────────────────────
INSERT INTO "app"."business_partners"
  ("id", "bp_code", "name", "name_kana", "short_name", "country_code", "is_active", "created_at", "updated_at") VALUES
  ('44444444-4444-4444-8444-444444444444', 'BP-00101',
   '{"ja":"日本重工業株式会社","en":"Nihon Heavy Industries Co., Ltd."}', 'ニホンジュウコウギョウ', '日本重工', 'JP', true, now(), now()),
  ('55555555-5555-4555-8555-555555555555', 'BP-00102',
   '{"ja":"関西自動車部品株式会社","en":"Kansai Auto Parts Co., Ltd."}', 'カンサイジドウシャブヒン', '関西自部品', 'JP', true, now(), now())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "app"."bp_role_assignments" ("id", "bp_id", "role", "is_active", "assigned_at") VALUES
  ('aaaaaaa2-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 'END_USER', true, now()),
  ('aaaaaaa2-0000-4000-8000-000000000002', '55555555-5555-4555-8555-555555555555', 'END_USER', true, now())
ON CONFLICT ("bp_id", "role") DO NOTHING;

INSERT INTO "app"."bp_end_user_attrs" ("bp_id", "industry") VALUES
  ('44444444-4444-4444-8444-444444444444', '産業機械'),
  ('55555555-5555-4555-8555-555555555555', '自動車部品')
ON CONFLICT ("bp_id") DO NOTHING;

-- ── 外注企業 (VENDOR role + bp_vendor_attrs) ─────────────────────────
INSERT INTO "app"."business_partners"
  ("id", "bp_code", "name", "name_kana", "short_name", "country_code", "is_active", "created_at", "updated_at") VALUES
  ('66666666-6666-4666-8666-666666666666', 'BP-00201',
   '{"ja":"中部研磨工業株式会社","en":"Chubu Grinding Industries Co., Ltd."}', 'チュウブケンマコウギョウ', '中部研磨', 'JP', true, now(), now()),
  ('77777777-7777-4777-8777-777777777777', 'BP-00202',
   '{"ja":"コーティングテック株式会社","en":"Coating Tech Co., Ltd."}', 'コーティングテック', 'Cテック', 'JP', true, now(), now()),
  ('88888888-8888-4888-8888-888888888888', 'BP-00203',
   '{"ja":"東京特殊鋼材株式会社","en":"Tokyo Special Steel Co., Ltd."}', 'トウキョウトクシュコウザイ', '東京特鋼', 'JP', true, now(), now())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "app"."bp_role_assignments" ("id", "bp_id", "role", "is_active", "assigned_at") VALUES
  ('aaaaaaa3-0000-4000-8000-000000000001', '66666666-6666-4666-8666-666666666666', 'VENDOR', true, now()),
  ('aaaaaaa3-0000-4000-8000-000000000002', '77777777-7777-4777-8777-777777777777', 'VENDOR', true, now()),
  ('aaaaaaa3-0000-4000-8000-000000000003', '88888888-8888-4888-8888-888888888888', 'VENDOR', true, now())
ON CONFLICT ("bp_id", "role") DO NOTHING;

INSERT INTO "app"."bp_vendor_attrs"
  ("bp_id", "vendor_code", "vendor_type", "closing_day", "payment_terms_days", "payment_day", "lead_time_days") VALUES
  ('66666666-6666-4666-8666-666666666666', 'V-001', 'OUTSOURCE', 31, 30, 31, 5),
  ('77777777-7777-4777-8777-777777777777', 'V-002', 'OUTSOURCE', 20, 30, 10, 7),
  ('88888888-8888-4888-8888-888888888888', 'V-003', 'SUPPLIER', 31, 60, 31, NULL)
ON CONFLICT ("bp_id") DO NOTHING;

-- BP コード採番 (BP-NNNNN, global serial) — seed 済みコードを追い越す位置から。
INSERT INTO "app"."numbering_sequences" ("key", "prefix", "last_year_month", "last_sequence", "updated_at")
  VALUES ('BP', 'BP', NULL, 300, now())
ON CONFLICT ("key") DO NOTHING;

-- ── 材種 (master.material_types) ─────────────────────────────────────
INSERT INTO "app"."material_types" ("id", "name", "description", "is_active", "created_at", "updated_at") VALUES
  ('A01A0001', '{"ja":"SUS303","en":"SUS303"}',
   '{"ja":"オーステナイト系ステンレス鋼（快削）。耐食性に優れ、切削加工性が高い。","en":"Free-machining austenitic stainless steel with good corrosion resistance."}',
   true, now(), now()),
  ('A02B0014', '{"ja":"SKD11","en":"SKD11"}',
   '{"ja":"冷間工具鋼。高い耐摩耗性を持つ。","en":"Cold-work tool steel with high wear resistance."}',
   true, now(), now()),
  ('B01A0007', '{"ja":"S45C 炭素鋼","en":"S45C carbon steel"}',
   '{"ja":"機械構造用炭素鋼。汎用材。","en":"General-purpose carbon steel for machine structures."}',
   true, now(), now()),
  ('B02B0002', '{"ja":"超硬 K40UF","en":"Carbide K40UF"}',
   '{"ja":"超微粒子超硬合金。工具用途。","en":"Ultra-fine grain cemented carbide for tooling."}',
   true, now(), now()),
  ('C03A0002', '{"ja":"A5052 アルミ合金","en":"A5052 aluminum alloy"}',
   '{"ja":"耐食性の良い汎用アルミ合金。","en":"General-purpose aluminum alloy with good corrosion resistance."}',
   false, now(), now())
ON CONFLICT ("id") DO NOTHING;

-- ── 素材 (master.materials) ──────────────────────────────────────────
INSERT INTO "app"."materials"
  ("id", "material_type_id", "name", "unit", "material_form", "is_active", "notes", "created_at", "updated_at") VALUES
  ('A01A0001-A083-330', 'A01A0001', '{"ja":"SUS303 φ8.3×330","en":"SUS303 dia8.3x330"}',
   '本', 'POLISHED', true, '快削ステンレス。研磨済み丸棒。', now(), now()),
  ('A01A0001-A200-300', 'A01A0001', '{"ja":"SUS303 φ20×3000","en":"SUS303 dia20x3000"}',
   '本', 'POLISHED', true, NULL, now(), now()),
  ('A02B0014-B320-250', 'A02B0014', '{"ja":"SKD11 φ32×2500","en":"SKD11 dia32x2500"}',
   '本', 'STANDARD_LENGTH', true, NULL, now(), now()),
  ('A02B0014-C100-050', 'A02B0014', '{"ja":"SKD11 半製品ブランク","en":"SKD11 semi-finished blank"}',
   '個', 'SEMI_FINISHED', false, '旧ロット。新規指示書では使用しない。', now(), now()),
  ('B01A0007-A160-400', 'B01A0007', '{"ja":"S45C φ16×4000","en":"S45C dia16x4000"}',
   '本', 'POLISHED', true, NULL, now(), now()),
  ('B02B0002-B060-330', 'B02B0002', '{"ja":"超硬 K40UF φ6×330","en":"Carbide K40UF dia6x330"}',
   '本', 'STANDARD_LENGTH', true, NULL, now(), now())
ON CONFLICT ("id") DO NOTHING;

-- ── 製品 (master.products) ───────────────────────────────────────────
INSERT INTO "app"."products"
  ("id", "name", "material_id", "unit", "spec", "is_active", "notes", "created_at", "updated_at") VALUES
  ('PRD-202606-0001', '{"ja":"精密軸","en":"Precision shaft"}', 'A01A0001-A200-300', '本',
   '{"外径":"φ20 ±0.01","全長":"300mm ±0.1","表面粗さ":"Ra 0.4","材質":"SUS303"}',
   true, '主力製品。公差厳しめ。', now(), now()),
  ('PRD-202606-0002', '{"ja":"ロッド","en":"Rod"}', 'A02B0014-B320-250', '本',
   '{"外径":"φ32 ±0.05","全長":"2500mm"}',
   true, NULL, now(), now()),
  ('PRD-202606-0003', '{"ja":"特殊加工品","en":"Custom machined part"}', 'B01A0007-A160-400', '本',
   '{"外径":"φ16","全長":"400mm","熱処理":"高周波焼入れ"}',
   true, '顧客支給図面による。', now(), now()),
  ('PRD-202606-0004', '{"ja":"超硬エンドミルブランク","en":"Carbide end mill blank"}', 'B02B0002-B060-330', '本',
   '{"刃径":"φ6","全長":"330mm","材質":"K40UF"}',
   true, NULL, now(), now()),
  ('PRD-202605-0044', '{"ja":"旧型スリーブ","en":"Legacy sleeve"}', 'A01A0001-A083-330', '個',
   NULL, false, '廃番予定。', now(), now())
ON CONFLICT ("id") DO NOTHING;
