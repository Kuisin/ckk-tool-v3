-- company-tsp.sql — 2 社目の自社法人（TSP）を用意する。自社法人・採番のシナリオが共有する準備。
--
--   自社法人 TSP（登録番号つき・会計年度 4 月始まり。まだ 1 枚も採番していない）
--   拠点 F01 本社工場 → CKK / F02 第二工場 → TSP
--
-- デモシードの拠点は自社法人が未設定（= 既定の CKK 扱い）。ここでは F01 を明示的に
-- CKK へ、F02 を TSP へ付ける。demo_shot（承認者）は F01・F02 の両方に所属している
-- ので、これで「2 社にまたがる人」になる（発行会社の欄が出る）。
-- 法人マスタそのものの操作（作成・拠点の付け替え）は own-company-master が画面で行う。

INSERT INTO app.own_companies
  (code, name, name_kana, postal_code, address, phone, fax,
   invoice_registration_no, fiscal_year_start_month, is_default, is_active, updated_at)
VALUES
  ('TSP',
   '{"ja": "ティー・エス・ピー株式会社", "en": "TSP Co., Ltd."}',
   'てぃーえすぴー',
   '460-0008',
   '{"ja": "愛知県名古屋市中区栄1丁目2番3号"}',
   '052-000-1111', '052-000-2222',
   'T9876543210987', 4, false, true, now());

UPDATE app.plants
   SET own_company_id = (SELECT id FROM app.own_companies WHERE code = 'CKK')
 WHERE code = 'F01';

UPDATE app.plants
   SET own_company_id = (SELECT id FROM app.own_companies WHERE code = 'TSP')
 WHERE code = 'F02';
