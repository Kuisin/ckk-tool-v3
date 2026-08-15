-- production-demo-seed.sql — 生産アプリ（PD02 指示書 / PD03 承認管理 / PD04 在庫管理）
-- のマニュアル撮影用デモデータ。
--
-- tools/docs-screenshots のローカル一時 DB に流す（orchestrate.ts SEED_FILES_POST —
-- sales-demo-seed.sql の後）。前提:
--   - マイグレーション済み（process_step_catalog 41 工程 + 依存、拠点 F01、
--     素材マスタ = 20260719120000_materials_from_excel）
--   - screenshot-user-seed.sql（demo_shot = a0b1c2d3-…5107）
--   - manufacturing-demo-seed.sql（第一/第二承認グループ（デモ）+ system ユーザー）
--   - sales-demo-seed.sql（デモ商事 d0…01、製品 9001〜9003、受注請書 ORD-202607-1〜3）
--   - masters-demo-seed.sql（外注先 BP-90004 デモ研磨工業 — VENDOR）
--
-- シナリオ:
--   受注請書 ORD-202607-00003 を注文請書 2 本（-01 / -02）に展開し、
--   指示書 #9001〜#9004 で状態のバリエーションを揃える:
--     #9001 進行中（承認済・段加工を demo_shot がセッションロック中・外注センタレス完了）
--     #9002 承認待ち（PENDING_1ST — PD03 一覧と承認ボタン撮影の主役）
--     #9003 下書き（在庫分 — 編集/コピー/キャンセル可の状態）
--     #9004 完了（全工程完了 → 製品在庫ロット 9004 に入庫済み）
--   在庫は 保管場所（第一倉庫/資材置場）× 棚 のバケットで持ち、予約・取引履歴・
--   在庫移動ペア・次回入荷（発注 ORDERED）まで一巡させる。
--
-- 冪等: 全行固定 UUID / 固定 ID / 固定日付（2026-07）+ ON CONFLICT。
-- 「今日」に依存する値を持たない（feature_flags.updated_at のみ now() 可）。

BEGIN;

-- ── 撮影用フラグ ────────────────────────────────────────────────────────────
-- 撮影は APP_ENV=main。生産 3 アプリは main 未公開のため撮影 DB に限り有効化。
INSERT INTO app.feature_flags (key, is_enabled, description, updated_at) VALUES
  ('app:work-orders:main', true, '指示書（マニュアル撮影用）', now()),
  ('app:approvals:main',   true, '承認管理（マニュアル撮影用）', now()),
  ('app:inventory:main',   true, '在庫管理（マニュアル撮影用）', now())
ON CONFLICT (key) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled, updated_at = now();

-- ── demo_shot を承認グループへ（承認/差し戻しボタン撮影用）────────────────────
-- manufacturing-demo-seed.sql の（デモ）グループへメンバー追加（system は残す）。
INSERT INTO app.approval_group_members (group_id, user_id, is_active)
SELECT g.id, u.id, true
FROM app.approval_groups g
CROSS JOIN app.users u
WHERE g.name->>'ja' IN ('第一承認グループ（デモ）', '第二承認グループ（デモ）')
  AND u.username = 'demo_shot'
ON CONFLICT (group_id, user_id) DO NOTHING;

-- ── demo_shot の所属拠点（PLANT スコープの保険。F02 は存在すれば）──────────────
INSERT INTO app.user_plants (user_id, plant_id, assigned_at)
SELECT u.id, p.id, '2026-07-01T09:00:00+09'::timestamptz
FROM app.users u
JOIN app.plants p ON p.code IN ('F01', 'F02')
WHERE u.username = 'demo_shot'
ON CONFLICT (user_id, plant_id) DO NOTHING;

-- ── 注文請書（ORD-202607-00003-01 / -02）────────────────────────────────────
-- 受注請書 (202607, 3)（REQUESTED のまま — 更新しない）に相乗り。
-- shipping-demo-seed がこの 2 行の固定 UUID に依存する（変更禁止）。
INSERT INTO app.sales_orders (id, year_month, seq, branch,
  customer_bp_id, customer_branch_bp_id, end_user_bp_id, customer_order_ref,
  product_id, lot_number, order_type, quantity, unit_price, amount,
  delivery_date, status, is_locked, notes, created_by, created_at, updated_at)
VALUES
  ('e0000000-0000-4000-8000-000000000001'::uuid, '202607', 3, 1,
   'd0000000-0000-4000-8000-000000000001'::uuid, NULL, NULL, 'D-2607-0170',
   9001, 9001, 'PRODUCTION'::app."ORDER_TYPE", 50, 3220, 161000,
   '2026-08-20', 'IN_PRODUCTION'::app."SALES_ORDER_STATUS", false, NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-14T09:30:00+09', '2026-07-16T08:30:00+09'),
  ('e0000000-0000-4000-8000-000000000002'::uuid, '202607', 3, 2,
   'd0000000-0000-4000-8000-000000000001'::uuid, NULL, NULL, 'D-2607-0170',
   9002, 9002, 'PRODUCTION'::app."ORDER_TYPE", 100, 1850, 185000,
   '2026-09-15', 'CONFIRMED'::app."SALES_ORDER_STATUS", false, NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-14T09:35:00+09', '2026-07-20T09:30:00+09')
ON CONFLICT (id) DO NOTHING;

-- ── 製品 9001 の工程ルート「標準工程」v1 ────────────────────────────────────
-- 使用依存を満たす 6 工程: 素材出し → 切断 → センタレス（外注: デモ研磨工業）
-- → 段加工 → 段加工検査 → 段加工検査承認。
INSERT INTO app.product_process_routes (id, product_id, name, is_active, notes,
  created_by, created_at, updated_at)
VALUES (9001, 9001,
  '{"ja": "標準工程", "en": "Standard route"}'::jsonb, true, NULL,
  'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
  '2026-07-14T10:00:00+09', '2026-07-14T10:00:00+09')
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('app.product_process_routes', 'id'),
              GREATEST((SELECT MAX(id) FROM app.product_process_routes), 9001));

INSERT INTO app.product_process_route_versions (id, route_id, version, notes,
  created_by, created_at)
VALUES ('dc040000-0000-4000-8000-000000000001'::uuid, 9001, 1, NULL,
  'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-14T10:00:00+09')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.product_process_route_version_steps (id, route_version_id,
  process_step_id, sort_order, execution_location, plant_id, supplier_bp_id, work_hours)
VALUES
  ('dc041000-0000-4000-8000-000000000001'::uuid, 'dc040000-0000-4000-8000-000000000001'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'MATERIAL_ISSUE'), 1,
   'INTERNAL'::app."STEP_EXECUTION",
   (SELECT id FROM app.plants WHERE code = 'F01'), NULL, 0.5),
  ('dc041000-0000-4000-8000-000000000002'::uuid, 'dc040000-0000-4000-8000-000000000001'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'CUTTING'), 2,
   'INTERNAL'::app."STEP_EXECUTION",
   (SELECT id FROM app.plants WHERE code = 'F01'), NULL, 2.0),
  ('dc041000-0000-4000-8000-000000000003'::uuid, 'dc040000-0000-4000-8000-000000000001'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'CENTERLESS'), 3,
   'OUTSOURCE'::app."STEP_EXECUTION", NULL,
   (SELECT id FROM app.business_partners WHERE bp_code = 'BP-90004'), NULL),
  ('dc041000-0000-4000-8000-000000000004'::uuid, 'dc040000-0000-4000-8000-000000000001'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_MACHINING'), 4,
   'INTERNAL'::app."STEP_EXECUTION",
   (SELECT id FROM app.plants WHERE code = 'F01'), NULL, 4.0),
  ('dc041000-0000-4000-8000-000000000005'::uuid, 'dc040000-0000-4000-8000-000000000001'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_INSPECTION'), 5,
   'INTERNAL'::app."STEP_EXECUTION",
   (SELECT id FROM app.plants WHERE code = 'F01'), NULL, 1.0),
  ('dc041000-0000-4000-8000-000000000006'::uuid, 'dc040000-0000-4000-8000-000000000001'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_INSPECTION_APPROVAL'), 6,
   'INTERNAL'::app."STEP_EXECUTION",
   (SELECT id FROM app.plants WHERE code = 'F01'), NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── 指示書 #9001〜#9004（固定番号 — 採番と衝突しないよう sequence を追従）──────
INSERT INTO app.work_orders (id, work_order_number, sales_order_id, product_id, type,
  planned_quantity, material_id, status, approval_status, route_version_id,
  requested_1st_at, requested_1st_by, approved_1st_at, approved_1st_by,
  approved_2nd_at, approved_2nd_by, approved_at, started_at, completed_at,
  history, notes, created_by, created_at, updated_at)
VALUES
  -- #9001: 進行中（受注 50 + 予備 5 = 55。承認記録あり・工程は下の steps 参照）
  ('dc000000-0000-4000-8000-000000009001'::uuid, 9001,
   'e0000000-0000-4000-8000-000000000001'::uuid, 9001, 'MANUFACTURE'::app."WORK_ORDER_TYPE",
   55, (SELECT id FROM app.materials WHERE code = 'B01A0001-B060-310'),
   'IN_PROGRESS'::app."WORK_ORDER_STATUS", 'APPROVED'::app."WORK_ORDER_APPROVAL_STATUS",
   'dc040000-0000-4000-8000-000000000001'::uuid,
   '2026-07-15T09:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-15T10:00:00+09', '00000000-0000-0000-0000-000000000000'::uuid,
   '2026-07-15T14:00:00+09', '00000000-0000-0000-0000-000000000000'::uuid,
   '2026-07-15T14:00:00+09', '2026-07-16T08:30:00+09', NULL,
   '[{"action": "CREATE", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-14T10:30:00+09:00"},
     {"action": "REQUEST_1ST", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-15T09:00:00+09:00"},
     {"action": "APPROVE_1ST", "user": "00000000-0000-0000-0000-000000000000", "at": "2026-07-15T10:00:00+09:00"},
     {"action": "APPROVE_2ND", "user": "00000000-0000-0000-0000-000000000000", "at": "2026-07-15T14:00:00+09:00"},
     {"action": "START", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-16T08:30:00+09:00"}]'::jsonb,
   NULL, 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-14T10:30:00+09', '2026-07-21T09:00:00+09'),
  -- #9002: 承認待ち（PENDING_1ST — PD03 の主役。approval_requests 行あり）
  ('dc000000-0000-4000-8000-000000009002'::uuid, 9002,
   'e0000000-0000-4000-8000-000000000002'::uuid, 9002, 'MANUFACTURE'::app."WORK_ORDER_TYPE",
   100, (SELECT id FROM app.materials WHERE code = 'B04A0001-B040-310'),
   'PENDING_APPROVAL'::app."WORK_ORDER_STATUS", 'PENDING_1ST'::app."WORK_ORDER_APPROVAL_STATUS",
   NULL,
   '2026-07-20T09:30:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   '[{"action": "CREATE", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-19T15:00:00+09:00"},
     {"action": "REQUEST_1ST", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-20T09:30:00+09:00"}]'::jsonb,
   NULL, 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-19T15:00:00+09', '2026-07-20T09:30:00+09'),
  -- #9003: 下書き（在庫分 — 編集・コピー・キャンセル可の状態バリエーション）
  ('dc000000-0000-4000-8000-000000009003'::uuid, 9003,
   'e0000000-0000-4000-8000-000000000001'::uuid, 9001, 'FROM_STOCK'::app."WORK_ORDER_TYPE",
   10, NULL,
   'DRAFT'::app."WORK_ORDER_STATUS", 'NONE'::app."WORK_ORDER_APPROVAL_STATUS",
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   '[{"action": "CREATE", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-19T16:20:00+09:00"}]'::jsonb,
   NULL, 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-19T16:20:00+09', '2026-07-19T16:20:00+09'),
  -- #9004: 完了（全工程完了 → 良品 55 を製品在庫ロット 9004 として入庫済み）
  ('dc000000-0000-4000-8000-000000009004'::uuid, 9004,
   'e0000000-0000-4000-8000-000000000001'::uuid, 9001, 'MANUFACTURE'::app."WORK_ORDER_TYPE",
   60, (SELECT id FROM app.materials WHERE code = 'B01A0001-B060-310'),
   'COMPLETED'::app."WORK_ORDER_STATUS", 'APPROVED'::app."WORK_ORDER_APPROVAL_STATUS",
   'dc040000-0000-4000-8000-000000000001'::uuid,
   '2026-07-08T09:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-08T11:00:00+09', '00000000-0000-0000-0000-000000000000'::uuid,
   '2026-07-08T15:00:00+09', '00000000-0000-0000-0000-000000000000'::uuid,
   '2026-07-08T15:00:00+09', '2026-07-09T08:30:00+09', '2026-07-18T16:00:00+09',
   '[{"action": "CREATE", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-08T08:30:00+09:00"},
     {"action": "APPROVE_2ND", "user": "00000000-0000-0000-0000-000000000000", "at": "2026-07-08T15:00:00+09:00"},
     {"action": "COMPLETE", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-18T16:00:00+09:00"}]'::jsonb,
   NULL, 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-08T08:30:00+09', '2026-07-18T16:00:00+09')
ON CONFLICT (id) DO NOTHING;

-- 採番 sequence を固定番号へ追従（アプリの nextSerialNumber と衝突しない）
INSERT INTO app.numbering_sequences (key, prefix, last_year_month, last_sequence, updated_at)
VALUES ('WORK_ORDER', 'WO', NULL, 9004, '2026-07-21T09:00:00+09')
ON CONFLICT (key) DO UPDATE
  SET last_sequence = GREATEST(app.numbering_sequences.last_sequence, 9004),
      updated_at = EXCLUDED.updated_at;

-- ── 工程ステップ ─────────────────────────────────────────────────────────────
-- 数量保存則: 良品 + 半製品 + 廃棄 + 手直し = 受入（COMPLETED 行は必ず満たす）。
-- 一時停止は status ではない — 進行中は session_locked_by と open actual で表す。

-- #9001: 素材出し✓ → 切断✓(55→51, 半製品2/廃棄2) → センタレス✓(外注・入荷済)
--        → 段加工●(demo_shot がロック中) → 段加工検査 → 段加工検査承認
INSERT INTO app.work_order_steps (id, work_order_id, process_step_id, sort_order,
  execution_location, plant_id, supplier_bp_id, planned_work_hours,
  outsource_requested_at, outsource_expected_at, outsource_received_at, outsource_cost,
  status, input_quantity, output_success_quantity,
  output_defect_semi_finished, output_defect_scrap, output_defect_rework,
  session_locked_by, session_locked_at,
  started_at, started_by, completed_at, completed_by, notes)
VALUES
  ('dc011000-0000-4000-8000-000000000001'::uuid, 'dc000000-0000-4000-8000-000000009001'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'MATERIAL_ISSUE'), 1,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, 0.5, NULL, NULL, NULL, NULL,
   'COMPLETED'::app."STEP_STATUS", 55, 55, 0, 0, 0, NULL, NULL,
   '2026-07-16T08:30:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-16T09:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid, NULL),
  ('dc011000-0000-4000-8000-000000000002'::uuid, 'dc000000-0000-4000-8000-000000009001'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'CUTTING'), 2,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, 2.0, NULL, NULL, NULL, NULL,
   'COMPLETED'::app."STEP_STATUS", 55, 51, 2, 2, 0, NULL, NULL,
   '2026-07-16T09:10:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-16T11:30:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid, NULL),
  ('dc011000-0000-4000-8000-000000000003'::uuid, 'dc000000-0000-4000-8000-000000009001'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'CENTERLESS'), 3,
   'OUTSOURCE'::app."STEP_EXECUTION", NULL,
   (SELECT id FROM app.business_partners WHERE bp_code = 'BP-90004'), NULL,
   '2026-07-16', '2026-07-18', '2026-07-18', 12000,
   'COMPLETED'::app."STEP_STATUS", 51, 51, 0, 0, 0, NULL, NULL,
   '2026-07-16T13:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-18T15:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid, NULL),
  ('dc011000-0000-4000-8000-000000000004'::uuid, 'dc000000-0000-4000-8000-000000009001'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_MACHINING'), 4,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, 4.0, NULL, NULL, NULL, NULL,
   'IN_PROGRESS'::app."STEP_STATUS", 51, NULL, NULL, NULL, NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-21T09:00:00+09',
   '2026-07-21T09:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   NULL, NULL, NULL),
  ('dc011000-0000-4000-8000-000000000005'::uuid, 'dc000000-0000-4000-8000-000000009001'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_INSPECTION'), 5,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, 1.0, NULL, NULL, NULL, NULL,
   'PENDING'::app."STEP_STATUS", NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL),
  ('dc011000-0000-4000-8000-000000000006'::uuid, 'dc000000-0000-4000-8000-000000009001'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_INSPECTION_APPROVAL'), 6,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, NULL, NULL, NULL, NULL, NULL,
   'PENDING'::app."STEP_STATUS", NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL),

  -- #9002: 全工程 PENDING（センタレスは外注依頼済み・入荷待ち — PU04 の未入荷例）
  ('dc012000-0000-4000-8000-000000000001'::uuid, 'dc000000-0000-4000-8000-000000009002'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'MATERIAL_ISSUE'), 1,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, 0.5, NULL, NULL, NULL, NULL,
   'PENDING'::app."STEP_STATUS", NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL),
  ('dc012000-0000-4000-8000-000000000002'::uuid, 'dc000000-0000-4000-8000-000000009002'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'CUTTING'), 2,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, 2.5, NULL, NULL, NULL, NULL,
   'PENDING'::app."STEP_STATUS", NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL),
  ('dc012000-0000-4000-8000-000000000003'::uuid, 'dc000000-0000-4000-8000-000000009002'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'CENTERLESS'), 3,
   'OUTSOURCE'::app."STEP_EXECUTION", NULL,
   (SELECT id FROM app.business_partners WHERE bp_code = 'BP-90004'), NULL,
   '2026-07-20', '2026-08-05', NULL, NULL,
   'PENDING'::app."STEP_STATUS", NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL),
  ('dc012000-0000-4000-8000-000000000004'::uuid, 'dc000000-0000-4000-8000-000000009002'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_MACHINING'), 4,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, 6.0, NULL, NULL, NULL, NULL,
   'PENDING'::app."STEP_STATUS", NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL),
  ('dc012000-0000-4000-8000-000000000005'::uuid, 'dc000000-0000-4000-8000-000000009002'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_INSPECTION'), 5,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, 1.5, NULL, NULL, NULL, NULL,
   'PENDING'::app."STEP_STATUS", NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL),
  ('dc012000-0000-4000-8000-000000000006'::uuid, 'dc000000-0000-4000-8000-000000009002'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_INSPECTION_APPROVAL'), 6,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, NULL, NULL, NULL, NULL, NULL,
   'PENDING'::app."STEP_STATUS", NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL),

  -- #9003（在庫分）: 出荷前検査 → 出荷 のみ
  ('dc013000-0000-4000-8000-000000000001'::uuid, 'dc000000-0000-4000-8000-000000009003'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'PRE_SHIP_INSPECTION'), 1,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, 0.5, NULL, NULL, NULL, NULL,
   'PENDING'::app."STEP_STATUS", NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL),
  ('dc013000-0000-4000-8000-000000000002'::uuid, 'dc000000-0000-4000-8000-000000009003'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'SHIPPING'), 2,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, NULL, NULL, NULL, NULL, NULL,
   'PENDING'::app."STEP_STATUS", NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL),

  -- #9004: 全工程 COMPLETED（60 → 良品 55 入庫。検査は INSPECTION モード表示）
  ('dc014000-0000-4000-8000-000000000001'::uuid, 'dc000000-0000-4000-8000-000000009004'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'MATERIAL_ISSUE'), 1,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, 0.5, NULL, NULL, NULL, NULL,
   'COMPLETED'::app."STEP_STATUS", 60, 60, 0, 0, 0, NULL, NULL,
   '2026-07-09T08:30:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-09T09:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid, NULL),
  ('dc014000-0000-4000-8000-000000000002'::uuid, 'dc000000-0000-4000-8000-000000009004'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'CUTTING'), 2,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, 2.0, NULL, NULL, NULL, NULL,
   'COMPLETED'::app."STEP_STATUS", 60, 58, 0, 2, 0, NULL, NULL,
   '2026-07-09T09:10:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-09T11:40:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid, NULL),
  ('dc014000-0000-4000-8000-000000000003'::uuid, 'dc000000-0000-4000-8000-000000009004'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'CENTERLESS'), 3,
   'OUTSOURCE'::app."STEP_EXECUTION", NULL,
   (SELECT id FROM app.business_partners WHERE bp_code = 'BP-90004'), NULL,
   '2026-07-09', '2026-07-11', '2026-07-11', 13000,
   'COMPLETED'::app."STEP_STATUS", 58, 58, 0, 0, 0, NULL, NULL,
   '2026-07-09T13:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-11T15:30:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid, NULL),
  ('dc014000-0000-4000-8000-000000000004'::uuid, 'dc000000-0000-4000-8000-000000009004'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_MACHINING'), 4,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, 4.0, NULL, NULL, NULL, NULL,
   'COMPLETED'::app."STEP_STATUS", 58, 56, 0, 2, 0, NULL, NULL,
   '2026-07-13T09:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-15T16:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid, NULL),
  ('dc014000-0000-4000-8000-000000000005'::uuid, 'dc000000-0000-4000-8000-000000009004'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_INSPECTION'), 5,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, 1.0, NULL, NULL, NULL, NULL,
   'COMPLETED'::app."STEP_STATUS", 56, 55, 0, 1, 0, NULL, NULL,
   '2026-07-16T09:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-16T15:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid, NULL),
  ('dc014000-0000-4000-8000-000000000006'::uuid, 'dc000000-0000-4000-8000-000000009004'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_INSPECTION_APPROVAL'), 6,
   'INTERNAL'::app."STEP_EXECUTION", (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, NULL, NULL, NULL, NULL, NULL,
   'COMPLETED'::app."STEP_STATUS", 55, 55, 0, 0, 0, NULL, NULL,
   '2026-07-18T14:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-18T16:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── 作業計画 / 実績（計画・実績パネル用。担当 = demo_shot・固定日付）──────────
INSERT INTO app.work_order_step_plans (id, work_order_step_id, user_id,
  planned_date, planned_start_at, planned_end_at, quantity, work_location_id,
  notes, created_by, created_at)
VALUES
  ('dc020000-0000-4000-8000-000000000001'::uuid, 'dc011000-0000-4000-8000-000000000004'::uuid,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-21',
   '2026-07-21T09:00:00+09', '2026-07-21T17:00:00+09', 51, NULL, NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-15T15:00:00+09'),
  ('dc020000-0000-4000-8000-000000000002'::uuid, 'dc011000-0000-4000-8000-000000000005'::uuid,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-22',
   NULL, NULL, 51, NULL, NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-15T15:00:00+09'),
  ('dc020000-0000-4000-8000-000000000003'::uuid, 'dc012000-0000-4000-8000-000000000004'::uuid,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-27',
   NULL, NULL, 100, NULL, NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-20T10:00:00+09')
ON CONFLICT (id) DO NOTHING;

-- 実績: 切断は完了実績、段加工は open（ended_at NULL = セッション作業中）
INSERT INTO app.work_order_step_actuals (id, work_order_step_id, user_id,
  worked_date, started_at, ended_at, quantity, notes, created_by, created_at)
VALUES
  ('dc021000-0000-4000-8000-000000000001'::uuid, 'dc011000-0000-4000-8000-000000000002'::uuid,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-16',
   '2026-07-16T09:10:00+09', '2026-07-16T11:30:00+09', 55, NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-16T09:10:00+09'),
  ('dc021000-0000-4000-8000-000000000002'::uuid, 'dc011000-0000-4000-8000-000000000004'::uuid,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-21',
   '2026-07-21T09:00:00+09', NULL, NULL, NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-21T09:00:00+09')
ON CONFLICT (id) DO NOTHING;

-- ── 承認依頼・承認記録（PD03 横断受信箱 + 指示書の承認記録リスト）──────────────
-- targetType = @@map 名 / targetId = 業務キー（指示書 = 番号文字列, PO = PO-…,
-- 受注請書 = ORD-…）。ORD-202607-00003 は sales-demo-seed の REQUESTED 行に対応。
INSERT INTO app.approval_requests (id, target_type, target_id, step, status,
  requested_by, requested_at, notes)
VALUES
  ('dc030000-0000-4000-8000-000000000001'::uuid, 'work_orders', '9001',
   'FIRST'::app."APPROVAL_STEP", 'APPROVED'::app."APPROVAL_REQUEST_STATUS",
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-15T09:00:00+09', NULL),
  ('dc030000-0000-4000-8000-000000000002'::uuid, 'work_orders', '9001',
   'SECOND'::app."APPROVAL_STEP", 'APPROVED'::app."APPROVAL_REQUEST_STATUS",
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-15T10:00:00+09', NULL),
  ('dc030000-0000-4000-8000-000000000003'::uuid, 'work_orders', '9002',
   'FIRST'::app."APPROVAL_STEP", 'PENDING'::app."APPROVAL_REQUEST_STATUS",
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-20T09:30:00+09',
   '納期優先でお願いします'),
  ('dc030000-0000-4000-8000-000000000004'::uuid, 'order_acceptances', 'ORD-202607-00003',
   'FIRST'::app."APPROVAL_STEP", 'PENDING'::app."APPROVAL_REQUEST_STATUS",
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-07T13:50:00+09', NULL),
  ('dc030000-0000-4000-8000-000000000005'::uuid, 'material_purchase_orders', 'PO-202607-90101',
   'FIRST'::app."APPROVAL_STEP", 'PENDING'::app."APPROVAL_REQUEST_STATUS",
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-21T10:00:00+09', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.approval_records (id, approval_request_id, approver_id,
  delegate_for_id, action, comment, acted_at)
VALUES
  ('dc031000-0000-4000-8000-000000000001'::uuid, 'dc030000-0000-4000-8000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000000'::uuid, NULL,
   'APPROVED'::app."APPROVAL_ACTION", '生産計画に問題なし', '2026-07-15T10:00:00+09'),
  ('dc031000-0000-4000-8000-000000000002'::uuid, 'dc030000-0000-4000-8000-000000000002'::uuid,
   '00000000-0000-0000-0000-000000000000'::uuid, NULL,
   'APPROVED'::app."APPROVAL_ACTION", NULL, '2026-07-15T14:00:00+09')
ON CONFLICT (id) DO NOTHING;

-- ── 素材発注書（PD03 の種別バリエーション + 素材タブ「次回入荷」/ATP 入荷行）──
-- 90101 = 承認依頼中（PD03 に teal バッジで並ぶ）/ 90102 = 発注済（入荷予定）。
-- 番号は 90xxx 帯 — 購買デモシードのアプリ採番帯（00001〜）と衝突しない。
INSERT INTO app.material_purchase_orders (id, po_number, supplier_bp_id, status,
  total_amount, currency, purchase_date, requested_at, requested_by,
  approved_at, approved_by, ordered_at, ordered_by, history, notes,
  created_by, created_at, updated_at)
VALUES
  ('dc060000-0000-4000-8000-000000000001'::uuid, 'PO-202607-90101',
   (SELECT id FROM app.business_partners WHERE bp_code = 'BP-90004'),
   'REQUESTED'::app."PURCHASE_STATUS", 124250, 'JPY', NULL,
   '2026-07-21T10:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   NULL, NULL, NULL, NULL,
   '[{"action": "CREATE", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-21T09:50:00+09:00"},
     {"action": "REQUEST", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-21T10:00:00+09:00"}]'::jsonb,
   NULL, 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-21T09:50:00+09', '2026-07-21T10:00:00+09'),
  ('dc060000-0000-4000-8000-000000000002'::uuid, 'PO-202607-90102',
   (SELECT id FROM app.business_partners WHERE bp_code = 'BP-90004'),
   'ORDERED'::app."PURCHASE_STATUS", 220000, 'JPY', '2026-07-15',
   '2026-07-14T11:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-14T15:00:00+09', '00000000-0000-0000-0000-000000000000'::uuid,
   '2026-07-15T09:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '[{"action": "ORDER", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-15T09:00:00+09:00"}]'::jsonb,
   NULL, 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-14T10:50:00+09', '2026-07-15T09:00:00+09')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.material_purchase_order_items (id, purchase_order_id, material_id,
  quantity, unit, unit_price, amount, currency, expected_at, received_quantity,
  plant_id, notes, sort_order)
VALUES
  ('dc061000-0000-4000-8000-000000000001'::uuid, 'dc060000-0000-4000-8000-000000000001'::uuid,
   (SELECT id FROM app.materials WHERE code = 'B01A0001-B060-310'),
   50, '本', 2485, 124250, 'JPY', '2026-08-20', 0,
   (SELECT id FROM app.plants WHERE code = 'F01'), NULL, 0),
  ('dc061000-0000-4000-8000-000000000002'::uuid, 'dc060000-0000-4000-8000-000000000002'::uuid,
   (SELECT id FROM app.materials WHERE code = 'B04A0001-B040-310'),
   200, '本', 1100, 220000, 'JPY', '2026-08-10', 0,
   (SELECT id FROM app.plants WHERE code = 'F01'), NULL, 0)
ON CONFLICT (id) DO NOTHING;

-- ── 保管場所 × 棚（ロケーションタブ・保管場所列・在庫移動の前提）──────────────
-- masters-demo-seed とは独立の専用バケット（id 9101〜 / code DC- 接頭辞）。
INSERT INTO app.storage_locations (id, plant_id, code, name, sort_order,
  is_active, notes, created_at, updated_at)
VALUES
  (9101, (SELECT id FROM app.plants WHERE code = 'F01'), 'DC-A',
   '{"ja": "第一倉庫", "en": "Warehouse 1"}'::jsonb, 10, true, NULL,
   '2026-07-01T09:00:00+09', '2026-07-01T09:00:00+09'),
  (9102, (SELECT id FROM app.plants WHERE code = 'F01'), 'DC-B',
   '{"ja": "資材置場", "en": "Material yard"}'::jsonb, 20, true, NULL,
   '2026-07-01T09:00:00+09', '2026-07-01T09:00:00+09')
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('app.storage_locations', 'id'),
              GREATEST((SELECT MAX(id) FROM app.storage_locations), 9102));

INSERT INTO app.storage_shelves (id, location_id, code, name, sort_order, is_active)
VALUES
  (9111, 9101, 'A-1', NULL, 10, true),
  (9112, 9101, 'A-2', NULL, 20, true),
  (9113, 9101, 'B-1', NULL, 30, true),
  (9121, 9102, 'S-1', NULL, 10, true)
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('app.storage_shelves', 'id'),
              GREATEST((SELECT MAX(id) FROM app.storage_shelves), 9121));

-- ── 製品在庫（完成品 / 半製品 / 未割当 / 移動先棚のバリエーション）─────────────
INSERT INTO app.product_inventory (id, product_id, plant_id, lot_number,
  quantity, reserved_quantity, is_semi_finished, source_step_id,
  storage_location_id, shelf_id, location, notes, updated_at)
VALUES
  -- #9004 完了ロットの完成品（受注 50 を予約中 → 利用可能 5）
  ('dc050000-0000-4000-8000-000000000001'::uuid, 9001,
   (SELECT id FROM app.plants WHERE code = 'F01'), 9004,
   55, 50, false, NULL, 9101, 9111, NULL, NULL, '2026-07-18T16:05:00+09'),
  -- #9001 切断工程で発生した半製品（source_step = 切断）
  ('dc050000-0000-4000-8000-000000000002'::uuid, 9001,
   (SELECT id FROM app.plants WHERE code = 'F01'), 9001,
   2, 0, true, 'dc011000-0000-4000-8000-000000000002'::uuid,
   9101, 9113, NULL, NULL, '2026-07-16T11:35:00+09'),
  -- 保管場所未割当の例（在庫移動の移動元）
  ('dc050000-0000-4000-8000-000000000003'::uuid, 9002,
   (SELECT id FROM app.plants WHERE code = 'F01'), NULL,
   30, 0, false, NULL, NULL, NULL, NULL, NULL, '2026-07-17T10:10:00+09'),
  -- 未割当 → 第一倉庫 A-2 へ 10 本移動した移動先バケット
  ('dc050000-0000-4000-8000-000000000004'::uuid, 9002,
   (SELECT id FROM app.plants WHERE code = 'F01'), NULL,
   10, 0, false, NULL, 9101, 9112, NULL, NULL, '2026-07-17T10:10:00+09'),
  ('dc050000-0000-4000-8000-000000000005'::uuid, 9003,
   (SELECT id FROM app.plants WHERE code = 'F01'), NULL,
   12, 0, false, NULL, 9102, 9121, NULL, NULL, '2026-07-10T14:00:00+09')
ON CONFLICT (id) DO NOTHING;

-- ── 素材在庫（予約 > 在庫 の ATP マイナス例を 1 行含む）───────────────────────
INSERT INTO app.material_inventory (id, material_id, plant_id,
  quantity, reserved_quantity, unit, storage_location_id, shelf_id,
  location, notes, updated_at)
VALUES
  ('dc051000-0000-4000-8000-000000000001'::uuid,
   (SELECT id FROM app.materials WHERE code = 'B01A0001-B060-310'),
   (SELECT id FROM app.plants WHERE code = 'F01'),
   80, 55, '本', 9102, 9121, NULL, NULL, '2026-07-15T09:10:00+09'),
  -- 予約 100 > 在庫 20 → 利用可能マイナス（ATP タイムラインの赤字例。
  -- PO-202607-90102 の入荷予定 200 本が 2026-08-10 に補う）
  ('dc051000-0000-4000-8000-000000000002'::uuid,
   (SELECT id FROM app.materials WHERE code = 'B04A0001-B040-310'),
   (SELECT id FROM app.plants WHERE code = 'F01'),
   20, 100, '本', 9102, NULL, NULL, NULL, '2026-07-20T09:35:00+09'),
  ('dc051000-0000-4000-8000-000000000003'::uuid,
   (SELECT id FROM app.materials WHERE code = 'B01A0001-B080-310'),
   (SELECT id FROM app.plants WHERE code = 'F01'),
   40, 0, '本', NULL, NULL, NULL, NULL, '2026-07-10T09:00:00+09')
ON CONFLICT (id) DO NOTHING;

-- ── 在庫引当・予約 ───────────────────────────────────────────────────────────
INSERT INTO app.inventory_reservations (id, inventory_type, inventory_id,
  sales_order_id, work_order_id, quantity, status, reserved_at, confirmed_at, released_at)
VALUES
  -- 注文請書 -01（50 本）が #9004 完了ロットを引当
  ('dc052000-0000-4000-8000-000000000001'::uuid, 'PRODUCT'::app."INVENTORY_TYPE",
   'dc050000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001'::uuid,
   NULL, 50, 'RESERVED'::app."RESERVATION_STATUS", '2026-07-18T16:05:00+09', NULL, NULL),
  -- #9001 の素材予約（55 本）
  ('dc052000-0000-4000-8000-000000000002'::uuid, 'MATERIAL'::app."INVENTORY_TYPE",
   'dc051000-0000-4000-8000-000000000001', NULL,
   'dc000000-0000-4000-8000-000000009001'::uuid, 55,
   'RESERVED'::app."RESERVATION_STATUS", '2026-07-15T09:10:00+09', NULL, NULL),
  -- #9002 の素材予約（100 本 — 台帳 20 本を上回る = 発注要）
  ('dc052000-0000-4000-8000-000000000003'::uuid, 'MATERIAL'::app."INVENTORY_TYPE",
   'dc051000-0000-4000-8000-000000000002', NULL,
   'dc000000-0000-4000-8000-000000009002'::uuid, 100,
   'RESERVED'::app."RESERVATION_STATUS", '2026-07-20T09:35:00+09', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── 在庫取引履歴（入庫 / 予約 / 在庫移動ペア — 取引履歴タブ用）────────────────
-- 在庫移動は referenceType 'stock_transfer' + 共通 referenceId の OUT/IN ペア。
INSERT INTO app.inventory_transactions (id, inventory_type, inventory_id,
  transaction_type, quantity, reference_type, reference_id, notes, created_by, created_at)
VALUES
  ('dc053000-0000-4000-8000-000000000001'::uuid, 'MATERIAL'::app."INVENTORY_TYPE",
   'dc051000-0000-4000-8000-000000000001', 'IN'::app."TRANSACTION_TYPE", 80,
   'material_receipt', NULL, '素材入荷', '00000000-0000-0000-0000-000000000000'::uuid,
   '2026-07-10T09:00:00+09'),
  ('dc053000-0000-4000-8000-000000000002'::uuid, 'MATERIAL'::app."INVENTORY_TYPE",
   'dc051000-0000-4000-8000-000000000001', 'RESERVE'::app."TRANSACTION_TYPE", 55,
   'work_order', 'dc000000-0000-4000-8000-000000009001',
   '指示書 #9001 素材予約', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-15T09:10:00+09'),
  ('dc053000-0000-4000-8000-000000000003'::uuid, 'MATERIAL'::app."INVENTORY_TYPE",
   'dc051000-0000-4000-8000-000000000002', 'RESERVE'::app."TRANSACTION_TYPE", 100,
   'work_order', 'dc000000-0000-4000-8000-000000009002',
   '指示書 #9002 素材予約', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-20T09:35:00+09'),
  ('dc053000-0000-4000-8000-000000000004'::uuid, 'PRODUCT'::app."INVENTORY_TYPE",
   'dc050000-0000-4000-8000-000000000001', 'IN'::app."TRANSACTION_TYPE", 55,
   'work_order', 'dc000000-0000-4000-8000-000000009004',
   '指示書 #9004 完了入庫', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-18T16:00:00+09'),
  ('dc053000-0000-4000-8000-000000000005'::uuid, 'PRODUCT'::app."INVENTORY_TYPE",
   'dc050000-0000-4000-8000-000000000001', 'RESERVE'::app."TRANSACTION_TYPE", 50,
   'sales_order', 'e0000000-0000-4000-8000-000000000001',
   '注文請書 ORD-202607-00003-01 引当', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-18T16:05:00+09'),
  ('dc053000-0000-4000-8000-000000000006'::uuid, 'PRODUCT'::app."INVENTORY_TYPE",
   'dc050000-0000-4000-8000-000000000002', 'IN'::app."TRANSACTION_TYPE", 2,
   'work_order', 'dc000000-0000-4000-8000-000000009001',
   '指示書 #9001 半製品入庫', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-16T11:35:00+09'),
  ('dc053000-0000-4000-8000-000000000007'::uuid, 'PRODUCT'::app."INVENTORY_TYPE",
   'dc050000-0000-4000-8000-000000000003', 'ADJUST'::app."TRANSACTION_TYPE", 40,
   NULL, NULL, '初期在庫登録（棚卸）', '00000000-0000-0000-0000-000000000000'::uuid,
   '2026-07-05T09:00:00+09'),
  -- 在庫移動: 未割当 → 第一倉庫 A-2（10 本）
  ('dc053000-0000-4000-8000-000000000008'::uuid, 'PRODUCT'::app."INVENTORY_TYPE",
   'dc050000-0000-4000-8000-000000000003', 'OUT'::app."TRANSACTION_TYPE", 10,
   'stock_transfer', 'dc054000-0000-4000-8000-000000000001',
   '在庫移動: 未割当 → 第一倉庫 / A-2', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-17T10:10:00+09'),
  ('dc053000-0000-4000-8000-000000000009'::uuid, 'PRODUCT'::app."INVENTORY_TYPE",
   'dc050000-0000-4000-8000-000000000004', 'IN'::app."TRANSACTION_TYPE", 10,
   'stock_transfer', 'dc054000-0000-4000-8000-000000000001',
   '在庫移動: 未割当 → 第一倉庫 / A-2', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-17T10:10:00+09')
ON CONFLICT (id) DO NOTHING;

COMMIT;
