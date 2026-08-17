-- system-demo-seed.sql — システムアプリ（SY01/SY08/SY09/SY0A + SY07）の
-- マニュアル撮影用デモデータ。
--
-- tools/docs-screenshots のローカル一時 DB に流す（orchestrate.ts SEED_FILES_POST）。
-- シード順の【最後】に実行する（shipping-billing-demo-seed の後）— 末尾の
-- audit_logs タイムスタンプ正規化が「全シードの後」に走る必要があるため。
--
-- 冪等: 全行固定 UUID（'de' プレフィックス）/ 固定日付 + ON CONFLICT。
-- 日付は 2026-07 固定 — 撮り直し（docs:verify）でピクセルが変わらないよう
-- 「今日」に依存する値を持たない（now()/gen_random_uuid() は feature_flags の
-- updated_at と audit 正規化の対象行以外で使わない）。
-- 前提: マイグレーション済み（拠点 F01 は migration 20260714110000 でシード済み）
--        + demo-users-seed.sql（demo1/demo3/demo4）+ rbac-seed.sql 適用済み。
--
-- RBAC 確認済み: rbac-seed.sql は admin ロールへ「全 permission コード × ADMIN」
-- を CROSS JOIN で付与する — kiosk / system も含まれるため demo1（admin）は
-- SY01〜SY09 全ページを開ける。追加の role_permission_relation 行は不要。

BEGIN;

-- ── 撮影用フラグ ────────────────────────────────────────────────────────────
-- 撮影は APP_ENV=main（本番相当の見た目）で行うため、main 未公開のシステム
-- アプリを撮影 DB に限り明示有効化する。本番の feature-flags-seed.sql には
-- 影響しない。app-management / file-management / activity-log は
-- feature-flags-seed.sql で既に有効化済み — ここでは追加しない。
INSERT INTO app.feature_flags (key, is_enabled, description, updated_at) VALUES
  ('app:user-management:main', true, 'ユーザー管理（マニュアル撮影用）',   now()),
  ('app:kiosk-cards:main',     true, 'QRカード管理（マニュアル撮影用）',   now()),
  ('app:kiosk-devices:main',   true, '端末管理（マニュアル撮影用）',       now()),
  ('app:kiosk-settings:main',  true, 'キオスク設定（マニュアル撮影用）',   now())
ON CONFLICT (key) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled, updated_at = now();

-- ── QRカード（SY08）────────────────────────────────────────────────────────
-- id = Crockford 16 桁（I/L/O/U を含まない）。一覧では下 8 桁のみ表示される。
--   1. 割当済（demo3 佐藤 三郎（製造））— PIN 設定済 / 無期限 / 使用実績あり
--   2. 未割当 — PIN 未設定（「ユーザーに割当」アクションの実例）
--   3. 割当済（demo4 高橋 四子（検査））— 有効期間が過去 → 赤「期限切れ」バッジ
--      （有効期間は固定の過去日付のみ — now() 由来の判定でも決定的）
INSERT INTO app.kiosk_cards (id, user_id, status,
  pin_hash, pin_set_at, pin_failed_attempts, pin_locked_until, pin_last_verified_at,
  last_used_at, use_count, max_active_sessions, valid_from, valid_until,
  assigned_at, assigned_by, revoked_at, revoked_by, created_at, updated_at)
VALUES
  ('7A2B3C4D5E6F7G8H',
   (SELECT id FROM app.users WHERE username = 'demo3'),
   'ASSIGNED'::app."KIOSK_CARD_STATUS",
   -- scrypt salt:hash hex（src/lib/password.ts と同形式の固定ダミー — 撮影では検証しない）
   '675ec4e1a8eedb385753e19f495e7bc9:297bfb1f6f522aeb322e09fad77c57cacbc380edcdfabd373a4ea6ef31b429d974f36cd4db869dc9b27d4cace31078fd7da4e8e24d2fdfbc3b15bc9442652de2',
   '2026-07-01T09:00:00+09', 0, NULL, '2026-07-01T09:00:00+09',
   '2026-07-10T08:30:00+09', 12, 1, NULL, NULL,
   '2026-07-01T09:00:00+09',
   (SELECT id FROM app.users WHERE username = 'demo1'),
   NULL, NULL, '2026-07-01T08:55:00+09', '2026-07-10T08:30:00+09'),
  ('9J0K1M2N3P4Q5R6S',
   NULL, 'UNASSIGNED'::app."KIOSK_CARD_STATUS",
   NULL, NULL, 0, NULL, NULL,
   NULL, 0, 1, NULL, NULL,
   NULL, NULL, NULL, NULL, '2026-07-01T08:55:00+09', '2026-07-01T08:55:00+09'),
  ('T7V8W9X0Y1Z2A3B4',
   (SELECT id FROM app.users WHERE username = 'demo4'),
   'ASSIGNED'::app."KIOSK_CARD_STATUS",
   NULL, NULL, 0, NULL, NULL,
   '2026-01-20T10:00:00+09', 3, 1,
   '2026-01-05T00:00:00+09', '2026-01-31T23:59:59+09',
   '2026-01-05T09:00:00+09',
   (SELECT id FROM app.users WHERE username = 'demo1'),
   NULL, NULL, '2026-01-05T08:55:00+09', '2026-01-31T23:59:59+09')
ON CONFLICT (id) DO NOTHING;

-- ── 端末プロファイル（SY09）────────────────────────────────────────────────
-- 拠点は F01（本社工場 — migration シード済み。plants.id は int なので code で解決）。
-- フロアマップは作らない（マップ撮影はスキップ — floor_map_id/map_x/map_y は NULL）。
--   1. ACTIVE  — last_activity_at を固定の過去（5 分窓の外）にして
--                initialOnline=false → 灰色「オフライン」ドットが決定的に出る。
--                fingerprint は NULL（🔑 行と「鍵リセット」アクションを出さない）。
--   2. PENDING — リンク待ちのオープンプロファイル（「未リンク」+ 端末をリンク/削除）
--   3. LINKED  — 有効化待ち（黄バッジ + 「有効化」アクション）
INSERT INTO app.kiosk_devices (id, name, location, plant_id,
  floor_map_id, map_x, map_y, status, settings_code, linked_at,
  device_token_hash, device_token_expires_at, device_public_key, fingerprint,
  user_agent, last_ip_address, activated_by, activated_at, last_activity_at,
  created_at, updated_at)
VALUES
  ('de000000-0000-4000-8000-000000000101'::uuid,
   '{"ja": "1F 検査室 タブレット1", "en": "1F Inspection Room Tablet 1"}'::jsonb, '検査室入口',
   (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, NULL, NULL, 'ACTIVE'::app."KIOSK_DEVICE_STATUS", '123456',
   '2026-06-01T10:00:00+09',
   NULL, NULL, NULL, NULL, NULL, NULL,
   (SELECT id FROM app.users WHERE username = 'demo1'),
   '2026-06-01T10:05:00+09', '2026-07-10T17:00:00+09',
   '2026-06-01T09:50:00+09', '2026-07-10T17:00:00+09'),
  ('de000000-0000-4000-8000-000000000102'::uuid,
   '{"ja": "2F 加工場 タブレット2", "en": "2F Machining Floor Tablet 2"}'::jsonb, '加工場中央',
   (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, NULL, NULL, 'PENDING'::app."KIOSK_DEVICE_STATUS", '234567',
   NULL,
   NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL,
   '2026-07-08T09:00:00+09', '2026-07-08T09:00:00+09'),
  ('de000000-0000-4000-8000-000000000103'::uuid,
   '{"ja": "1F 素材受入 タブレット3", "en": "1F Material Receiving Tablet 3"}'::jsonb, '受入検収カウンター',
   (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL, NULL, NULL, 'LINKED'::app."KIOSK_DEVICE_STATUS", '345678',
   '2026-07-09T14:00:00+09',
   NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL,
   '2026-07-09T13:50:00+09', '2026-07-09T14:00:00+09')
ON CONFLICT (id) DO NOTHING;

-- kiosk_link_requests は入れない — SY09 の UI はリンクコードを一切表示しない
-- （コードはタブレット側 /setup に表示され、SY09 は入力する側。actions.ts が
-- 消費するのみ）。リンクモーダルの撮影はダミーコードを打鍵すれば足りる。

-- ── カードセッション履歴（SY08 詳細「最近のログイン」/ SY09「利用履歴」）────
-- id = セッショントークンの SHA-256 hex（64 桁）— 固定ダミー値。
-- 全行 revoked_at 済み + expires_at も過去 → 「利用中」バッジが出ない（決定的）。
INSERT INTO app.kiosk_sessions (id, user_id, card_id, device_id,
  created_at, expires_at, last_activity_at, revoked_at)
VALUES
  ('de00000000000000000000000000000000000000000000000000000000000001',
   (SELECT id FROM app.users WHERE username = 'demo3'),
   '7A2B3C4D5E6F7G8H', 'de000000-0000-4000-8000-000000000101'::uuid,
   '2026-07-10T08:30:00+09', '2026-07-10T16:30:00+09',
   '2026-07-10T11:45:00+09', '2026-07-10T11:45:00+09'),
  ('de00000000000000000000000000000000000000000000000000000000000002',
   (SELECT id FROM app.users WHERE username = 'demo3'),
   '7A2B3C4D5E6F7G8H', 'de000000-0000-4000-8000-000000000101'::uuid,
   '2026-07-09T09:00:00+09', '2026-07-09T17:00:00+09',
   '2026-07-09T12:00:00+09', '2026-07-09T12:00:00+09')
ON CONFLICT (id) DO NOTHING;

-- ── 端末利用ログ（SY09 詳細「最近の利用者」= LOGIN 集計 / 利用履歴）────────
-- id は bigserial — 固定 id（9001〜）で冪等にし、シーケンスを追い越しておく。
INSERT INTO app.kiosk_device_logs (id, device_id, type, user_id, source, created_at)
VALUES
  (9001, 'de000000-0000-4000-8000-000000000101'::uuid, 'LOGIN'::app."KIOSK_DEVICE_LOG_TYPE",
   (SELECT id FROM app.users WHERE username = 'demo3'), 'login',  '2026-07-09T09:00:00+09'),
  (9002, 'de000000-0000-4000-8000-000000000101'::uuid, 'LOGOUT'::app."KIOSK_DEVICE_LOG_TYPE",
   (SELECT id FROM app.users WHERE username = 'demo3'), 'logout', '2026-07-09T12:00:00+09'),
  (9003, 'de000000-0000-4000-8000-000000000101'::uuid, 'LOGIN'::app."KIOSK_DEVICE_LOG_TYPE",
   (SELECT id FROM app.users WHERE username = 'demo3'), 'login',  '2026-07-10T08:30:00+09'),
  (9004, 'de000000-0000-4000-8000-000000000101'::uuid, 'LOGOUT'::app."KIOSK_DEVICE_LOG_TYPE",
   (SELECT id FROM app.users WHERE username = 'demo3'), 'logout', '2026-07-10T11:45:00+09')
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('app.kiosk_device_logs', 'id'),
              GREATEST((SELECT MAX(id) FROM app.kiosk_device_logs), 9004));

-- ── SY01 ユーザー管理の決定化 ───────────────────────────────────────────────
-- demo/dev ユーザーのロール割当（rbac-seed / dev-role-users-seed）は
-- assigned_at を now() で入れる → ユーザー詳細の「割当日」が DB 構築時刻に
-- 依存する。全行を固定時刻へ正規化（冪等・表示専用値のため無害）。
UPDATE app.user_role_relation
SET assigned_at = '2026-07-01T09:00:00+09'
WHERE assigned_at IS NOT NULL
  AND assigned_at <> '2026-07-01T09:00:00+09';

-- ── SY07 操作履歴のデモ行 ───────────────────────────────────────────────────
-- 新規 DB では audit-demo-seed が製品未投入の段階で走るためスキップされ、監査
-- ログがほぼ空になる。SY07 の一覧・詳細撮影用に、既存デモ文書を指す代表的な
-- CREATE/UPDATE 行を投入する（created_at は直後の正規化で固定時刻に再配置）。
INSERT INTO app.audit_logs (user_id, action, table_name, record_id, before_data, after_data)
SELECT * FROM (VALUES
  ('a0b1c2d3-0000-4000-8000-000000005107'::uuid, 'CREATE', 'estimates', 'EST-202607-00001',
   NULL::jsonb, '{"name": "エンドミル φ6×60 CX400", "status": "DRAFT"}'::jsonb),
  ('a0b1c2d3-0000-4000-8000-000000005107'::uuid, 'UPDATE', 'estimates', 'EST-202607-00001',
   '{"status": "DRAFT"}'::jsonb, '{"status": "CONFIRMED"}'::jsonb),
  ('a0b1c2d3-0000-4000-8000-000000005107'::uuid, 'CREATE', 'price_list_entries', 'PRC-202607-00001',
   NULL::jsonb, '{"customer": "デモ商事株式会社", "product": "PRD-202607-0001"}'::jsonb),
  ('a0b1c2d3-0000-4000-8000-000000005107'::uuid, 'CREATE', 'quotes', 'QOT-202607-00001',
   NULL::jsonb, '{"status": "DRAFT", "customer": "デモ商事株式会社"}'::jsonb),
  ('a0b1c2d3-0000-4000-8000-000000005107'::uuid, 'UPDATE', 'quotes', 'QOT-202607-00001',
   '{"status": "DRAFT"}'::jsonb, '{"status": "ISSUED"}'::jsonb),
  ('a0b1c2d3-0000-4000-8000-000000005107'::uuid, 'CREATE', 'work_orders', '9001',
   NULL::jsonb, '{"type": "MANUFACTURE", "plannedQuantity": 55}'::jsonb),
  ('a0b1c2d3-0000-4000-8000-000000005107'::uuid, 'UPDATE', 'work_orders', '9001',
   '{"status": "APPROVED"}'::jsonb, '{"status": "IN_PROGRESS"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'CREATE', 'shipping_orders', 'SHP-202607-00001',
   NULL::jsonb, '{"type": "DISPATCH", "status": "SHIPPED"}'::jsonb)
) AS t(user_id, action, table_name, record_id, before_data, after_data)
WHERE NOT EXISTS (
  SELECT 1 FROM app.audit_logs WHERE table_name = 'estimates' AND record_id = 'EST-202607-00001'
);

-- ── audit_logs タイムスタンプ正規化（SY07 操作履歴の決定化）─────────────────
-- 先行シード（manufacturing-demo-seed / audit-demo-seed）は audit_logs の
-- created_at を now() で入れる → SY07 一覧（日時 desc）の表示がシード実行時刻に
-- 依存してしまう。全行を id 順の固定時刻（2026-07-14 10:00 から 1 分刻み）に
-- 揃える — 一覧の並び（id 降順 = 日時降順）とピクセルが毎回同一になる。
-- 撮影中は読み取りのみで audit 行は増えないため、この正規化で完全に決定的。
-- 冪等: 再実行しても同じ id → 同じ時刻に収束する。
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY id) - 1 AS rn
  FROM app.audit_logs
)
UPDATE app.audit_logs a
SET created_at = timestamptz '2026-07-14 10:00:00+09' + make_interval(mins => o.rn::int)
FROM ordered o
WHERE a.id = o.id;

COMMIT;
