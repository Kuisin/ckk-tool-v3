-- regrind-demo-seed.sql — 再研磨品目（MS0H）の撮影・デモ用データ。
--
-- **本番には入れない**（extended-master-seed.sql と同じ扱い）。流すのは
-- 撮影用の使い捨て DB と dev だけ。
--
-- 入れるのは **再研磨品目だけ**。意図的に以下を作らない:
--
--   * 他社製品 / 注文請書 / 価格表 / 指示書 … どれも絞り込みの無い一覧
--     （/master/products・/sales/order-acceptances・/sales/price-lists・
--     /production/work-orders）に行が増え、**既存のスクリーンショットが
--     ずれる**。再研磨の値段の表を見せるのにそこまでは要らない。
--   * **再研磨工程リスト** … 有効なリストが 1 本だけのときは指示書ビルダーが
--     自動で選ぶ、という挙動に通し確認（e2e-regrind.ts C3/C4）が依っている。
--     ここで 2 本目を作ると自動選択が止まり、あの試験が落ちる。
--
-- 旧 FileMaker の 再研マスタ 1 行 = 1 品目。条件（工具の種類 × 加工箇所 ×
-- 刃数 × サイズ帯）の組み合わせぶんだけ行が並ぶ、という形が読めるように
-- 4 行だけ入れる。金額は採番表の実例に近い値（外周のみ 2枚刃 φ10 以下 = 390）。
BEGIN;

-- 撮影用アプリ（APP_ENV=main）でも MS0H を出す。**本番公開ではない** —
-- このファイルは撮影用 DB と dev にしか流さないので、production の
-- feature-flags-seed.sql は何も変わらない。撮影アプリが main として走る
-- （orchestrate.ts）ため、行が無いと「この機能は現在利用できません」になる
-- （masters-demo-seed.sql が他のマスタに対してやっているのと同じ）。
INSERT INTO app.feature_flags (key, is_enabled, description, updated_at) VALUES
  ('app:master-regrind-items:main', true, '再研磨品目（マニュアル撮影用）', now())
ON CONFLICT (key) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled, updated_at = now();

INSERT INTO app.items (id, item_type, code, name, unit, is_active,
  standard_unit_price, regrind_tool_class, regrind_location, regrind_flutes,
  regrind_size_min_mm, regrind_size_max_mm, match_names, created_at, updated_at)
VALUES
  (9201, 'REGRIND'::app."ITEM_TYPE", 'RGD-202601-0001',
   '{"ja": "再研磨 超硬エンドミル 外周 2枚刃 φ10以下", "en": "Regrind carbide end mill, periphery, 2FL, to φ10"}'::jsonb,
   '本', true, 390, '超硬ヘリカルエンドミル', '外周のみ', 2, 0, 10,
   ARRAY['再研', '外周研磨'], now(), now()),
  (9202, 'REGRIND'::app."ITEM_TYPE", 'RGD-202601-0002',
   '{"ja": "再研磨 超硬エンドミル 溝 2枚刃 φ10以下", "en": "Regrind carbide end mill, flute, 2FL, to φ10"}'::jsonb,
   '本', true, 540, '超硬ヘリカルエンドミル', '溝のみ', 2, 0, 10,
   ARRAY['再研', '溝研磨'], now(), now()),
  (9203, 'REGRIND'::app."ITEM_TYPE", 'RGD-202601-0003',
   '{"ja": "再研磨 超硬エンドミル 外周+溝 2枚刃 φ10以下", "en": "Regrind carbide end mill, periphery + flute, 2FL, to φ10"}'::jsonb,
   '本', true, 860, '超硬ヘリカルエンドミル', '外周 + 溝', 2, 0, 10,
   ARRAY['再研'], now(), now()),
  (9204, 'REGRIND'::app."ITEM_TYPE", 'RGD-202601-0004',
   '{"ja": "再研磨 超硬エンドミル 外周 4枚刃 φ10超20以下", "en": "Regrind carbide end mill, periphery, 4FL, φ10-20"}'::jsonb,
   '本', true, 720, '超硬ヘリカルエンドミル', '外周のみ', 4, 10, 20,
   ARRAY['再研', '外周研磨'], now(), now())
ON CONFLICT (id) DO UPDATE
  SET standard_unit_price = EXCLUDED.standard_unit_price,
      name = EXCLUDED.name,
      regrind_tool_class = EXCLUDED.regrind_tool_class,
      regrind_location = EXCLUDED.regrind_location,
      regrind_flutes = EXCLUDED.regrind_flutes,
      regrind_size_min_mm = EXCLUDED.regrind_size_min_mm,
      regrind_size_max_mm = EXCLUDED.regrind_size_max_mm,
      is_active = true,
      updated_at = now();

-- 連番が撮影データの id を踏まないように進める（他のデモシードと同じ作法）。
SELECT setval(pg_get_serial_sequence('app.items', 'id'),
              GREATEST((SELECT MAX(id) FROM app.items), 9204));

COMMIT;
