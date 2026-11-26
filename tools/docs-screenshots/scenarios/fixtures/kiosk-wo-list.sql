-- kiosk-wo-list の準備（この 1 本の DB にだけ流す）。
--
-- 撮影用の端末（de…0901）は本社工場 F01・既定の作業場所 NC-01、カードは demo_shot。
-- シードの指示書は #9001 進行中 / #9002 承認依頼中 / #9003 下書き / #9004 完了（どれも本社工場）。
-- 一覧に「出る・出ない」を両方確かめるために足すもの:
--   #9101 承認済み・本社工場（ドリル φ4）          → 出る
--   #9102 承認済み・第二工場だけ（リーマ φ8）      → 出ない（端末の拠点と違う）
-- 工程画面で確かめるもの:
--   #9001 段加工 に工程納期（未来）               → 工程カードに「工程納期」
--   デモ商事の系列 v1（確定済み — #9001 が使う版）に加工プログラム 2 本
--     マシニング V5 用（段加工 + 段加工検査）/ NC旋盤 A型 用（段加工）
--     → 端末・計画・実績の機械 NC-01 は NC旋盤 A型 なので NC旋盤 A型 用が先頭
BEGIN;

-- デモシードが見本として入れている加工プログラムを外す（この 1 本が置く 2 本だけを見る）。
-- 使用記録（work_order_step_programs）は版を RESTRICT で守っているので先に外す。
-- 記録が無くなった #9001 段加工（開始済み）は、記録の無い工程として現行版を出す。
DELETE FROM app.work_order_step_programs;
DELETE FROM app.design_programs;


INSERT INTO app.work_orders (id, work_order_number, product_item_id, type, planned_quantity,
  status, approval_status, approved_at, approved_by, created_by, created_at, updated_at)
VALUES
  ('dc000000-0000-4000-8000-000000009101', 9101, 9002, 'MANUFACTURE', 30,
   'APPROVED', 'APPROVED', now(), '00000000-0000-0000-0000-000000000000',
   'a0b1c2d3-0000-4000-8000-000000005107', now(), now()),
  ('dc000000-0000-4000-8000-000000009102', 9102, 9003, 'MANUFACTURE', 20,
   'APPROVED', 'APPROVED', now(), '00000000-0000-0000-0000-000000000000',
   'a0b1c2d3-0000-4000-8000-000000005107', now(), now());

INSERT INTO app.work_order_steps (id, work_order_id, process_step_id, sort_order,
  execution_location, plant_id, planned_work_hours, status)
VALUES
  ('dc091010-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000009101',
   (SELECT id FROM app.process_step_catalog WHERE code = 'CUTTING'), 1, 'INTERNAL',
   (SELECT id FROM app.plants WHERE code = 'F01'), 1, 'PENDING'),
  ('dc091010-0000-4000-8000-000000000002', 'dc000000-0000-4000-8000-000000009101',
   (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_MACHINING'), 2, 'INTERNAL',
   (SELECT id FROM app.plants WHERE code = 'F01'), 3, 'PENDING'),
  ('dc091020-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000009102',
   (SELECT id FROM app.process_step_catalog WHERE code = 'CUTTING'), 1, 'INTERNAL',
   (SELECT id FROM app.plants WHERE code = 'F02'), 1, 'PENDING'),
  ('dc091020-0000-4000-8000-000000000002', 'dc000000-0000-4000-8000-000000009102',
   (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_MACHINING'), 2, 'INTERNAL',
   (SELECT id FROM app.plants WHERE code = 'F02'), 2, 'PENDING');

-- #9001 段加工（demo_shot が作業中・計画と実績の作業場所は NC-01）に工程納期（来月 20 日）。
UPDATE app.work_order_steps
   SET due_date = (date_trunc('month', (now() AT TIME ZONE 'Asia/Tokyo')) + interval '1 month 19 days')::date
 WHERE id = 'dc011000-0000-4000-8000-000000000004';

-- 加工プログラム — #9001（顧客 = デモ商事）が見る版 = デモ商事の系列の確定済み最新（v1）。
-- 並び（sort_order）は MC-01 用が先。工程画面では機械が一致する NC-01 用が先頭に来るはず。
INSERT INTO app.design_programs (id, design_version_id, program_key, revision, name, program_number,
  notes, sort_order, created_by, created_at, updated_at)
VALUES
  ('d6000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000003',
   'd6000000-0000-4000-8000-000000000001', 1,
   '段加工 荒取り（マシニング）', 'O2001', NULL, 0,
   'a0b1c2d3-0000-4000-8000-000000005107', now(), now()),
  ('d6000000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000003',
   'd6000000-0000-4000-8000-000000000002', 1,
   '段加工 仕上げ（NC旋盤）', 'O1001', '主軸 3000rpm。首下は客先指定の寸法に注意', 1,
   'a0b1c2d3-0000-4000-8000-000000005107', now(), now());

INSERT INTO app.design_program_steps (program_id, process_step_id)
VALUES
  ('d6000000-0000-4000-8000-000000000001', (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_MACHINING')),
  ('d6000000-0000-4000-8000-000000000001', (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_INSPECTION')),
  ('d6000000-0000-4000-8000-000000000002', (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_MACHINING'));

INSERT INTO app.design_program_machine_models (program_id, machine_model_id)
VALUES
  ('d6000000-0000-4000-8000-000000000001', (SELECT id FROM app.machine_models WHERE code = 'MC-V5')),
  ('d6000000-0000-4000-8000-000000000002', (SELECT id FROM app.machine_models WHERE code = 'NC-LATHE-A'));

COMMIT;

-- #9101 切断（未着手）に過ぎた工程納期（先月 10 日）→ 共有端末でも赤く出るはず。
UPDATE app.work_order_steps
   SET due_date = (date_trunc('month', (now() AT TIME ZONE 'Asia/Tokyo')) - interval '1 month' + interval '9 days')::date
 WHERE id = 'dc091010-0000-4000-8000-000000000001';
