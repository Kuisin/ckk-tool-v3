-- design-programs-memo の準備（この 1 本の DB にだけ流す）。
--
-- シードの製品 9001（超硬エンドミル φ6×60）には系列が 2 本ある:
--   汎用        v1・v2（どちらも確定）
--   デモ商事    v1（確定）— 指示書 #9001（顧客 = デモ商事）が使う系列
-- デモ商事の系列に下書きの v2 を足す（図面ファイルの実体は無い — この環境に
-- オブジェクトストレージが無いため。files 行だけ置く。シードの他の版と同じ）。
-- 画面でプログラムを足して確定すると、#9001 が見る版が v1 → v2 に替わる。
-- 加工プログラムは図面の確定とは独立で、確定後も足し・直しができる。
-- 系列メモが「別の受注元の系列には出ない」ことを見るために、兼房の系列（v1 確定）も足す。
BEGIN;

-- デモシードが見本として入れている加工プログラムと系列メモを外す（この 1 本は
-- 何も無いところから画面で登録して確かめる）。
-- 使用記録（work_order_step_programs）は版を RESTRICT で守っているので先に外す。
DELETE FROM app.work_order_step_programs;
DELETE FROM app.design_programs;
DELETE FROM app.document_memos WHERE owner_type = 'design_series';


INSERT INTO app.files (id, storage_key, filename, mime_type, size_bytes, created_at)
VALUES
  ('d5000000-0000-4000-8000-0000000000a2', 'demo/design/dwg-demo-v2.pdf',
   '設計図面_デモ商事仕様_v2.pdf', 'application/pdf', 501000, now()),
  ('d5000000-0000-4000-8000-0000000000b1', 'demo/design/dwg-kanefusa-v1.pdf',
   '設計図面_兼房仕様_v1.pdf', 'application/pdf', 480000, now());

INSERT INTO app.design_versions (id, item_id, customer_bp_id, version, status, notes,
  material_type_id, diameter_mm, length_mm, confirmed_at, confirmed_by, created_by, created_at, updated_at)
VALUES
  ('d9000000-0000-4000-8000-0000000000a2', 9001, 'd0000000-0000-4000-8000-000000000001', 2,
   'DRAFT', '段加工の逃がし寸法を変更',
   (SELECT id FROM app.material_types WHERE code = 'B01A0001'), 6.0, 60.0,
   NULL, NULL, 'a0b1c2d3-0000-4000-8000-000000005107', now(), now()),
  ('d9000000-0000-4000-8000-0000000000b1', 9001,
   (SELECT id FROM app.business_partners WHERE name->>'ja' = '兼房株式会社'), 1,
   'CONFIRMED', '兼房向け',
   (SELECT id FROM app.material_types WHERE code = 'B01A0001'), 6.0, 60.0,
   now(), 'a0b1c2d3-0000-4000-8000-000000005107', 'a0b1c2d3-0000-4000-8000-000000005107', now(), now());

INSERT INTO app.design_files (id, design_version_id, design_request_id, item_id, customer_bp_id, file_id,
  version, is_latest, role, notes, created_by, created_at)
VALUES
  ('d8000000-0000-4000-8000-0000000000a2', 'd9000000-0000-4000-8000-0000000000a2', NULL, 9001,
   'd0000000-0000-4000-8000-000000000001',
   'd5000000-0000-4000-8000-0000000000a2', 2, false, 'BLUEPRINT', '段加工の逃がし寸法を変更',
   'a0b1c2d3-0000-4000-8000-000000005107', now()),
  ('d8000000-0000-4000-8000-0000000000b1', 'd9000000-0000-4000-8000-0000000000b1', NULL, 9001,
   (SELECT id FROM app.business_partners WHERE name->>'ja' = '兼房株式会社'),
   'd5000000-0000-4000-8000-0000000000b1', 1, true, 'BLUEPRINT', '兼房向け',
   'a0b1c2d3-0000-4000-8000-000000005107', now());

COMMIT;
