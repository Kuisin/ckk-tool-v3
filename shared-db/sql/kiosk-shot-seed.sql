-- kiosk-shot-seed.sql — キオスク（現場タブレット）マニュアル撮影用の端末とカード。
--
-- 撮影パイプライン（tools/docs-screenshots）専用。実運用では使わない:
--   * 端末トークンとカード PIN が既知の固定値なので、本番 DB には入れないこと。
--   * 端末登録（管理者がリンク）を UI で自動化する代わりに、トークンのハッシュを
--     直接入れて Playwright 側で cookie（kiosk_device）にそのトークンを載せる。
--
-- 既知の値:
--   端末トークン : ckk-shot-device-token-fixed-0001
--   カード ID    : SHT1234567890ABC（demo_shot に割当 — 工程が割り当てられている人）
--   PIN          : 4321
-- 冪等。適用は orchestrate.ts の SEED_FILES_POST 経由。

BEGIN;

-- 撮影用端末（有効・トークン期限は固定の未来日）
INSERT INTO app.kiosk_devices (id, name, location, plant_id,
  default_work_location_id, enforce_work_location,
  floor_map_id, map_x, map_y, status, settings_code, linked_at,
  device_token_hash, device_token_expires_at, device_public_key, fingerprint,
  user_agent, last_ip_address, activated_by, activated_at, last_activity_at,
  created_at, updated_at)
VALUES
  ('de000000-0000-4000-8000-000000000901'::uuid,
   '{"ja": "1F 加工場 タブレット（撮影用）", "en": "1F Machining Floor Tablet (docs)"}'::jsonb, '加工場入口',
   (SELECT id FROM app.plants WHERE code = 'F01'),
   -- 既定の作業場所（撮影: SY09 編集モーダル・キオスク実行画面・端末設定画面）
   (SELECT id FROM app.work_locations WHERE code = 'NC-01'), false,
   NULL, NULL, NULL, 'ACTIVE'::app."KIOSK_DEVICE_STATUS", '901234',
   '2026-07-01T09:00:00+09',
   -- sha256('ckk-shot-device-token-fixed-0001')
   '644cfd07f53dca8aea0a2b3fd5d7311e6932fa5021d9955245477e73b2360c5d',
   '2099-12-31T23:59:59+09', NULL, NULL, NULL, NULL,
   (SELECT id FROM app.users WHERE username = 'demo1'),
   '2026-07-01T09:05:00+09', '2026-07-21T09:00:00+09',
   '2026-07-01T08:55:00+09', '2026-07-21T09:00:00+09')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  device_token_hash = EXCLUDED.device_token_hash,
  device_token_expires_at = EXCLUDED.device_token_expires_at,
  default_work_location_id = EXCLUDED.default_work_location_id,
  enforce_work_location = EXCLUDED.enforce_work_location;

-- 撮影用カード（demo_shot に割当・PIN 4321・工程が割り当たっている人）
INSERT INTO app.kiosk_cards (id, user_id, status,
  pin_hash, pin_set_at, pin_failed_attempts, pin_locked_until, pin_last_verified_at,
  last_used_at, use_count, max_active_sessions, valid_from, valid_until,
  assigned_at, assigned_by, revoked_at, revoked_by, created_at, updated_at)
VALUES
  ('SHT1234567890ABC',
   (SELECT id FROM app.users WHERE username = 'demo_shot'),
   'ASSIGNED'::app."KIOSK_CARD_STATUS",
   -- scrypt salt:hash（PIN = 4321）
   'a1b2c3d4e5f60718293a4b5c6d7e8f90:395a3b7d6d61d1239c8d9bffcf4f8aac7de68b165af54f7d884253c687176e6f9c8e634b544f42755a3ebcd7b4a2a5c0a765895e699e6abcdabb011a6a1120bb',
   '2026-07-01T09:00:00+09', 0, NULL, '2026-07-21T08:00:00+09',
   '2026-07-21T08:00:00+09', 5, 1, NULL, NULL,
   '2026-07-01T09:00:00+09',
   (SELECT id FROM app.users WHERE username = 'demo1'),
   NULL, NULL, '2026-07-01T08:55:00+09', '2026-07-21T08:00:00+09')
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  status = EXCLUDED.status,
  pin_hash = EXCLUDED.pin_hash,
  pin_failed_attempts = 0,
  pin_locked_until = NULL,
  pin_last_verified_at = EXCLUDED.pin_last_verified_at;

-- ── 指示書 #9005（共有端末の「検査承認」「最終検査・出荷前確認」の撮影用）────
-- デモシードの進行中の指示書（#9001）は段加工の途中なので、検査承認・最終検査の
-- 工程を作業中にできない（#9001 を動かすと Web 側の撮影がずれる）。そこで
-- 撮影専用の在庫向け指示書を 1 本足す:
--   検査（段加工検査）✓ — 合格の検査記録 1 件（承認待ち）
--   → 検査承認 ●（一時停止中 = 作業中・ロックなし）
--   → 出荷前検査 ●（一時停止中。最終検査の工程）
-- 工程は拠点なし・作業計画なし — 共有端末の指示書一覧（端末の拠点で絞る）と
-- 作業場所の一覧に出さず、既存の撮影を変えないため。作業計画が無い工程は
-- 誰でも開ける（canOperateStep）ので、/steps/<id> で直接開いて撮る。
INSERT INTO app.work_orders (id, work_order_number, legacy_number, product_item_id, type,
  planned_quantity, status, approval_status,
  requested_at, requested_by, approved_at, approved_by, started_at,
  history, created_by, created_at, updated_at)
VALUES
  ('dc000000-0000-4000-8000-000000009005'::uuid, 9005, 'WOR-202607-09005',
   9001, 'MANUFACTURE'::app."WORK_ORDER_TYPE", 20,
   'IN_PROGRESS'::app."WORK_ORDER_STATUS", 'APPROVED'::app."WORK_ORDER_APPROVAL_STATUS",
   '2026-07-16T09:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-16T14:00:00+09', '00000000-0000-0000-0000-000000000000'::uuid,
   '2026-07-17T08:30:00+09',
   '[{"action": "CREATE", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-16T08:30:00+09:00"},
     {"action": "APPROVE_FINAL", "user": "00000000-0000-0000-0000-000000000000", "at": "2026-07-16T14:00:00+09:00"},
     {"action": "START", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-17T08:30:00+09:00"}]'::jsonb,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-16T08:30:00+09', '2026-07-21T09:00:00+09')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.numbering_sequences (key, prefix, last_year_month, last_sequence, updated_at)
VALUES ('WORK_ORDER', 'WO', NULL, 9005, '2026-07-21T09:00:00+09')
ON CONFLICT (key) DO UPDATE
  SET last_sequence = GREATEST(app.numbering_sequences.last_sequence, 9005);

INSERT INTO app.work_order_steps (id, work_order_id, process_step_id, sort_order,
  execution_location, status, input_quantity, output_success_quantity,
  output_defect_semi_finished, output_defect_scrap, output_defect_rework,
  started_at, started_by, completed_at, completed_by)
VALUES
  ('dc015000-0000-4000-8000-000000000001'::uuid, 'dc000000-0000-4000-8000-000000009005'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_INSPECTION'), 1,
   'INTERNAL'::app."STEP_EXECUTION", 'COMPLETED'::app."STEP_STATUS", 20, 20, 0, 0, 0,
   '2026-07-17T08:30:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-17T10:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid),
  ('dc015000-0000-4000-8000-000000000002'::uuid, 'dc000000-0000-4000-8000-000000009005'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_INSPECTION_APPROVAL'), 2,
   'INTERNAL'::app."STEP_EXECUTION", 'IN_PROGRESS'::app."STEP_STATUS", 20, NULL, NULL, NULL, NULL,
   '2026-07-17T10:30:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid, NULL, NULL),
  ('dc015000-0000-4000-8000-000000000003'::uuid, 'dc000000-0000-4000-8000-000000009005'::uuid,
   (SELECT id FROM app.process_step_catalog WHERE code = 'PRE_SHIP_INSPECTION'), 3,
   'INTERNAL'::app."STEP_EXECUTION", 'IN_PROGRESS'::app."STEP_STATUS", 20, NULL, NULL, NULL, NULL,
   '2026-07-17T11:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- 合格の検査記録（承認待ち）と、その記入内容（「検査表を見る」で読める中身）。
-- 検査表は**旧版 v1（9101）**を使う — 記録が付いた版は使用中になって項目を
-- 足せなくなるので、最新版 9102 に付けると検査表テンプレートの撮影
-- （項目の追加モーダル）が止まる。
INSERT INTO app.inspection_records (id, work_order_step_id, template_id, status, recorded_by, recorded_at)
VALUES ('dc016000-0000-4000-8000-000000000001'::uuid, 'dc015000-0000-4000-8000-000000000001'::uuid,
        9101, 'PASS'::app."INSPECTION_STATUS", 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
        '2026-07-17T09:50:00+09')
ON CONFLICT (id) DO NOTHING;
INSERT INTO app.inspection_record_items (inspection_record_id, template_item_id, measured_value, measured_values, is_pass)
SELECT 'dc016000-0000-4000-8000-000000000001'::uuid, i.id, NULL,
       CASE i.input_type
         WHEN 'NUMBER' THEN '["6.01","5.99"]'::jsonb
         WHEN 'SELECT_SINGLE' THEN jsonb_build_array(i.options->0->>'value')
         ELSE '["true"]'::jsonb
       END, true
FROM app.inspection_template_items i WHERE i.template_id = 9101
  -- 行に一意キーが無いので、流し直しで重複しないよう記録単位で止める
  AND NOT EXISTS (SELECT 1 FROM app.inspection_record_items x
                   WHERE x.inspection_record_id = 'dc016000-0000-4000-8000-000000000001'::uuid);

COMMIT;
