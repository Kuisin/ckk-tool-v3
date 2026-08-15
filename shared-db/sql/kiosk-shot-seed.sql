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
  floor_map_id, map_x, map_y, status, settings_code, linked_at,
  device_token_hash, device_token_expires_at, device_public_key, fingerprint,
  user_agent, last_ip_address, activated_by, activated_at, last_activity_at,
  created_at, updated_at)
VALUES
  ('de000000-0000-4000-8000-000000000901'::uuid,
   '1F 加工場 タブレット（撮影用）', '加工場入口',
   (SELECT id FROM app.plants WHERE code = 'F01'),
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
  device_token_expires_at = EXCLUDED.device_token_expires_at;

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

COMMIT;
