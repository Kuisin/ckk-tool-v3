-- Demo seed for the master-data screens (材種 / 素材 / 製品). Idempotent
-- (ON CONFLICT DO NOTHING); safe to re-run. Apply with:
--   cd shared-db && pnpm seed:demo        (DATABASE_URL from .env)
--
-- Demo products use a past month (PRD-202606-*) so they can never collide
-- with PRD auto-numbering, which starts fresh each month via
-- sys.numbering_sequences.
--
-- BP (取引先) は demo データを持たない — 実データは data-migration の
-- レガシー取込（export_bp_import.py → bp_import.sql、BP-01001〜）で投入する。

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
