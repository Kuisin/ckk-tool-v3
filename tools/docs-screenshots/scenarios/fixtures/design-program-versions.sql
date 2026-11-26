-- design-program-versions の準備（この 1 本の DB にだけ流す）。
--
-- シードのデモ商事の系列 v1（d9…03・確定済み）には加工プログラムが 3 本ある:
--   素材の切断・外径       v1（#9001 切断で使用済み）
--   段加工（荒・仕上げ）   v1（#9001 段加工で使用済み・過去の版）→ v2（現行・未使用）
--   段加工（マシニング用） v1（#9001 段加工で使用済み）
-- ここでは「これから開始する工程」を 2 つ足す。どちらもその版をピン留めした
-- 承認済みの指示書で、工程は段加工 1 つ（前工程なし = すぐ開始できる）・計画の
-- 機械は NC-02（NC旋盤 A型）・担当者なし（共有端末で誰でも開始できる）。
--   #9201 … 共有端末で開始する（開始で版が記録されることを見る）
--   #9202 … 開始しない（あとで新しい版ができたら、新しい版が出ることを見る）
BEGIN;

INSERT INTO app.work_orders (id, work_order_number, product_item_id, type, planned_quantity,
  status, approval_status, approved_at, approved_by, design_file_id, created_by, created_at, updated_at)
VALUES
  ('dc000000-0000-4000-8000-000000009201', 9201, 9001, 'MANUFACTURE', 20,
   'APPROVED', 'APPROVED', now(), '00000000-0000-0000-0000-000000000000',
   (SELECT id FROM app.design_files WHERE design_version_id = 'd9000000-0000-4000-8000-000000000003' ORDER BY created_at LIMIT 1),
   'a0b1c2d3-0000-4000-8000-000000005107', now(), now()),
  ('dc000000-0000-4000-8000-000000009202', 9202, 9001, 'MANUFACTURE', 20,
   'APPROVED', 'APPROVED', now(), '00000000-0000-0000-0000-000000000000',
   (SELECT id FROM app.design_files WHERE design_version_id = 'd9000000-0000-4000-8000-000000000003' ORDER BY created_at LIMIT 1),
   'a0b1c2d3-0000-4000-8000-000000005107', now(), now());

INSERT INTO app.work_order_steps (id, work_order_id, process_step_id, sort_order,
  execution_location, plant_id, planned_work_hours, status)
VALUES
  ('dc092010-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000009201',
   (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_MACHINING'), 1, 'INTERNAL',
   (SELECT id FROM app.plants WHERE code = 'F01'), 1, 'PENDING'),
  ('dc092020-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000009202',
   (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_MACHINING'), 1, 'INTERNAL',
   (SELECT id FROM app.plants WHERE code = 'F01'), 1, 'PENDING');

INSERT INTO app.work_order_step_plans (id, work_order_step_id, user_id, planned_date,
  quantity, work_location_id, created_by, created_at)
VALUES
  ('dc092030-0000-4000-8000-000000000001', 'dc092010-0000-4000-8000-000000000001', NULL,
   (now() AT TIME ZONE 'Asia/Tokyo')::date, 20,
   (SELECT id FROM app.work_locations WHERE code = 'NC-02'),
   'a0b1c2d3-0000-4000-8000-000000005107', now()),
  ('dc092030-0000-4000-8000-000000000002', 'dc092020-0000-4000-8000-000000000001', NULL,
   (now() AT TIME ZONE 'Asia/Tokyo')::date, 20,
   (SELECT id FROM app.work_locations WHERE code = 'NC-02'),
   'a0b1c2d3-0000-4000-8000-000000005107', now());

COMMIT;
