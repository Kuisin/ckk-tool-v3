-- purchase-demo-seed.sql — 購買アプリ（PU03/PU02/PU01）のマニュアル撮影用デモデータ。
--
-- tools/docs-screenshots のローカル一時 DB に流す（orchestrate.ts SEED_FILES_POST）。
-- 実行順の前提: sales-demo-seed → masters-demo-seed → 本ファイル。
--   - 架空仕入先 BP-90003（デモ精密材料株式会社 / SUPPLIER）・BP-90004
--     （デモ研磨工業株式会社 / OUTSOURCE）は masters-demo-seed が作成済み —
--     本ファイルでは bp_code で参照するのみ（作成しない）。
--   - 拠点は F01（本社工場 — migration 20260714110000 でシード）と
--     F02（masters-demo-seed が追加）を code で参照するのみ（作成しない）。
--   - 素材は migration 20260719120000_materials_from_excel の実在コードを
--     code で参照する（materials.id は Int autoincrement のため subselect）。
--   - 承認グループ（第一/第二承認グループ（デモ））+ システムユーザー
--     （00000000-…-000000000000）は manufacturing-demo-seed が作成済み。
--   - 撮影ユーザー demo_shot（a0b1c2d3-0000-4000-8000-000000005107 / 撮影 太郎）
--     は screenshot-user-seed が作成済み。
--
-- 冪等: 全行固定 UUID（db… プレフィクス）/ 固定日付 2026-07 + ON CONFLICT。
-- 「今日」に依存する値を持たない（撮り直しでピクセルが変わらない）。
--
-- numbering_sequences は更新しない — PRQ/PO の採番（lib/numbering.ts）は
-- year_month で月次リセットされるため、撮影時点（2026-07 以外の月）に UI から
-- 新規作成しても PRQ-<当月>-00001 となり本シードの 202607 番号とは衝突しない。
-- また撮影は閲覧のみでフォーム送信を行わない。

BEGIN;

-- ── 撮影用フラグ ────────────────────────────────────────────────────────────
-- 撮影は APP_ENV=main で行うため、main 未公開の購買 4 アプリを撮影 DB に限り
-- 明示有効化する（キーは src/lib/app-list.ts の key と一致）。
-- 本番の feature-flags-seed.sql には影響しない。
INSERT INTO app.feature_flags (key, is_enabled, description, updated_at) VALUES
  ('app:material-receipts:main', true, '素材入荷（マニュアル撮影用）', now()),
  ('app:outsource-orders:main',  true, '外注依頼（マニュアル撮影用）', now()),
  ('app:purchase-orders:main',   true, '素材発注書（マニュアル撮影用）', now()),
  ('app:purchase-requests:main', true, '購買依頼（マニュアル撮影用）', now())
ON CONFLICT (key) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled, updated_at = now();

-- ── 購買依頼（PRQ-202607-00001〜00003）──────────────────────────────────────
-- ステータス網羅: REQUESTED（承認依頼中 — PENDING の approval_requests 付き）/
-- APPROVED（発注書へ変換 ボタンの撮影用）/ DRAFT。
-- history は lib/approvals.ts HistoryEntry {action,user,at,notes} — user は
-- uuid（表示側 data.ts が displayName へ解決）。action キーは
-- PURCHASE_REQUEST_HISTORY_ACTION_LABEL（CREATE/UPDATE/REQUEST_APPROVAL/
-- APPROVE/REJECT/CONVERT/CANCEL）に一致させる。
INSERT INTO app.purchase_requests (id, request_number, status, purpose,
  requested_at, requested_by, approved_at, approved_by, history, notes,
  created_by, created_at, updated_at)
VALUES
  ('db100000-0000-4000-8000-000000000001'::uuid, 'PRQ-202607-00001',
   'REQUESTED'::app."PURCHASE_REQUEST_STATUS", '7月ロット用 素材補充',
   '2026-07-02T09:30:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   NULL, NULL,
   '[{"action": "CREATE", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-02T09:00:00+09:00"},
     {"action": "REQUEST_APPROVAL", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-02T09:30:00+09:00"}]'::jsonb,
   NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-02T09:00:00+09', '2026-07-02T09:30:00+09'),
  ('db100000-0000-4000-8000-000000000002'::uuid, 'PRQ-202607-00002',
   'APPROVED'::app."PURCHASE_REQUEST_STATUS", '8月生産分 K40UF 補充',
   '2026-07-03T10:30:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-04T11:00:00+09', '00000000-0000-0000-0000-000000000000'::uuid,
   '[{"action": "CREATE", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-03T10:00:00+09:00"},
     {"action": "REQUEST_APPROVAL", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-03T10:30:00+09:00"},
     {"action": "APPROVE", "user": "00000000-0000-0000-0000-000000000000", "at": "2026-07-04T11:00:00+09:00", "notes": "在庫僅少のため承認"}]'::jsonb,
   NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-03T10:00:00+09', '2026-07-04T11:00:00+09'),
  ('db100000-0000-4000-8000-000000000003'::uuid, 'PRQ-202607-00003',
   'DRAFT'::app."PURCHASE_REQUEST_STATUS", '黒皮材 試作用（検討中）',
   NULL, NULL, NULL, NULL,
   '[{"action": "CREATE", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-05T14:00:00+09:00"}]'::jsonb,
   NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-05T14:00:00+09', '2026-07-05T14:00:00+09')
ON CONFLICT (id) DO NOTHING;

-- 明細（単価・仕入先は持たない — 発注書変換時に確定する仕様）
INSERT INTO app.purchase_request_items (id, request_id, material_id, quantity,
  unit, desired_at, plant_id, notes, sort_order)
VALUES
  ('db110000-0000-4000-8000-000000000001'::uuid,
   'db100000-0000-4000-8000-000000000001'::uuid,
   (SELECT id FROM app.materials WHERE code = 'B01A0001-B060-310'),
   50, '本', '2026-08-10', (SELECT id FROM app.plants WHERE code = 'F01'), NULL, 0),
  ('db110000-0000-4000-8000-000000000002'::uuid,
   'db100000-0000-4000-8000-000000000001'::uuid,
   (SELECT id FROM app.materials WHERE code = 'B01A0001-B080-310'),
   30, '本', '2026-08-10', (SELECT id FROM app.plants WHERE code = 'F02'), NULL, 1),
  ('db110000-0000-4000-8000-000000000003'::uuid,
   'db100000-0000-4000-8000-000000000002'::uuid,
   (SELECT id FROM app.materials WHERE code = 'B04A0001-B040-310'),
   100, '本', '2026-08-20', (SELECT id FROM app.plants WHERE code = 'F01'),
   '7月ロット消化後の補充分', 0),
  ('db110000-0000-4000-8000-000000000004'::uuid,
   'db100000-0000-4000-8000-000000000003'::uuid,
   (SELECT id FROM app.materials WHERE code = 'A02A0001-A200-310'),
   10, '本', NULL, NULL, NULL, 0)
ON CONFLICT (id) DO NOTHING;

-- ── 素材発注書（PO-202607-00001〜00003）─────────────────────────────────────
-- ステータス網羅: ORDERED（分納 1 回目入荷済 — 「入荷済 n」表示の撮影用）/
-- REQUESTED（PENDING の approval_requests 付き）/ DRAFT。
-- history の action キーは PURCHASE_HISTORY_ACTION_LABEL（CREATE/UPDATE/
-- REQUEST_APPROVAL/APPROVE/REJECT/ORDER/COMPLETE/CANCEL）に一致させる。
-- total_amount = Σ items.amount（amount = quantity × unit_price）。
INSERT INTO app.material_purchase_orders (id, po_number, supplier_bp_id, status,
  total_amount, currency, purchase_date,
  requested_at, requested_by, approved_at, approved_by, ordered_at, ordered_by,
  history, notes, created_by, created_at, updated_at)
VALUES
  ('db200000-0000-4000-8000-000000000001'::uuid, 'PO-202607-00001',
   (SELECT id FROM app.business_partners WHERE bp_code = 'BP-90003'),
   'ORDERED'::app."PURCHASE_STATUS", 241520, 'JPY', '2026-07-10',
   '2026-07-08T10:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-09T09:30:00+09', '00000000-0000-0000-0000-000000000000'::uuid,
   '2026-07-10T09:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '[{"action": "CREATE", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-08T09:00:00+09:00"},
     {"action": "REQUEST_APPROVAL", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-08T10:00:00+09:00"},
     {"action": "APPROVE", "user": "00000000-0000-0000-0000-000000000000", "at": "2026-07-09T09:30:00+09:00"},
     {"action": "ORDER", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-10T09:00:00+09:00"}]'::jsonb,
   NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-08T09:00:00+09', '2026-07-10T09:00:00+09'),
  ('db200000-0000-4000-8000-000000000002'::uuid, 'PO-202607-00002',
   (SELECT id FROM app.business_partners WHERE bp_code = 'BP-90003'),
   'REQUESTED'::app."PURCHASE_STATUS", 133500, 'JPY', NULL,
   '2026-07-11T10:00:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   NULL, NULL, NULL, NULL,
   '[{"action": "CREATE", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-11T09:30:00+09:00"},
     {"action": "REQUEST_APPROVAL", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-11T10:00:00+09:00"}]'::jsonb,
   NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-11T09:30:00+09', '2026-07-11T10:00:00+09'),
  ('db200000-0000-4000-8000-000000000003'::uuid, 'PO-202607-00003',
   (SELECT id FROM app.business_partners WHERE bp_code = 'BP-90004'),
   'DRAFT'::app."PURCHASE_STATUS", 162630, 'JPY', NULL,
   NULL, NULL, NULL, NULL, NULL, NULL,
   '[{"action": "CREATE", "user": "a0b1c2d3-0000-4000-8000-000000005107", "at": "2026-07-13T15:00:00+09:00"}]'::jsonb,
   '黒皮材の価格確認中',
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-13T15:00:00+09', '2026-07-13T15:00:00+09')
ON CONFLICT (id) DO NOTHING;

-- 明細（received_quantity: PO-1 の 1 行目のみ 20/50 分納入荷済）
INSERT INTO app.material_purchase_order_items (id, purchase_order_id, material_id,
  quantity, unit, unit_price, amount, currency, expected_at, received_quantity,
  plant_id, notes, sort_order)
VALUES
  ('db210000-0000-4000-8000-000000000001'::uuid,
   'db200000-0000-4000-8000-000000000001'::uuid,
   (SELECT id FROM app.materials WHERE code = 'B01A0001-B060-310'),
   50, '本', 2485, 124250, 'JPY', '2026-07-20', 20,
   (SELECT id FROM app.plants WHERE code = 'F01'), NULL, 0),
  ('db210000-0000-4000-8000-000000000002'::uuid,
   'db200000-0000-4000-8000-000000000001'::uuid,
   (SELECT id FROM app.materials WHERE code = 'B01A0001-B080-310'),
   30, '本', 3909, 117270, 'JPY', '2026-07-25', 0,
   (SELECT id FROM app.plants WHERE code = 'F02'), NULL, 1),
  ('db210000-0000-4000-8000-000000000003'::uuid,
   'db200000-0000-4000-8000-000000000002'::uuid,
   (SELECT id FROM app.materials WHERE code = 'B04A0001-B040-310'),
   100, '本', 1335, 133500, 'JPY', '2026-08-05', 0,
   (SELECT id FROM app.plants WHERE code = 'F01'), NULL, 0),
  ('db210000-0000-4000-8000-000000000004'::uuid,
   'db200000-0000-4000-8000-000000000003'::uuid,
   (SELECT id FROM app.materials WHERE code = 'A02A0001-A200-310'),
   10, '本', 16263, 162630, 'JPY', NULL, 0,
   NULL, NULL, 0)
ON CONFLICT (id) DO NOTHING;

-- ── 素材入荷（material_receipts）────────────────────────────────────────────
-- 1 件目: PO-202607-00001 明細 1 行目の分納（20/50 — received_quantity と一致。
--   発注明細列に PO リンクが出る「発注入荷」の実例、詳細撮影用の固定 uuid）。
-- 2 件目: 直接調達（仕入先あり・PO リンクなし → 「直接調達」バッジ）。
-- 3 件目: 直接調達（仕入先なし — 任意項目が「—」表示になる実例）。
INSERT INTO app.material_receipts (id, material_id, supplier_bp_id,
  purchase_order_item_id, quantity, unit, received_at, plant_id, notes,
  created_by, created_at)
VALUES
  ('db300000-0000-4000-8000-000000000001'::uuid,
   (SELECT id FROM app.materials WHERE code = 'B01A0001-B060-310'),
   (SELECT id FROM app.business_partners WHERE bp_code = 'BP-90003'),
   'db210000-0000-4000-8000-000000000001'::uuid,
   20, '本', '2026-07-18', (SELECT id FROM app.plants WHERE code = 'F01'),
   '分納 1回目（残 30 本は 7/20 予定）',
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-18T10:30:00+09'),
  ('db300000-0000-4000-8000-000000000002'::uuid,
   (SELECT id FROM app.materials WHERE code = 'B01A0001-B080-310'),
   (SELECT id FROM app.business_partners WHERE bp_code = 'BP-90003'),
   NULL,
   15, '本', '2026-07-15', (SELECT id FROM app.plants WHERE code = 'F01'),
   NULL,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-15T14:00:00+09'),
  ('db300000-0000-4000-8000-000000000003'::uuid,
   (SELECT id FROM app.materials WHERE code = 'B04A0001-B040-310'),
   NULL, NULL,
   40, '本', '2026-07-16', (SELECT id FROM app.plants WHERE code = 'F02'),
   '持ち込み分',
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-16T09:15:00+09')
ON CONFLICT (id) DO NOTHING;

-- ── 承認依頼・承認記録（approval_requests / approval_records）────────────────
-- 詳細ページは fetchApprovalTrail(targetType, targetId=業務番号) で本テーブルを
-- 読む（承認記録セクション）。REQUESTED の対象には PENDING 行が実データと同じ
-- 形で必要（承認操作 actOnApprovalRequest も PENDING 行を消費する）。
-- APPROVED/ORDERED の対象には APPROVED 行 + 記録（承認者 = システム — 第一承認
-- グループ（デモ）の唯一のメンバー）を付けてトレイルを表示させる。
-- 段は enum（FIRST/SECOND）ではなく step_no（1..N）+ step_count になり、
-- 依頼時点のフロー全体を flow_snapshot に複写するようになった。ここでは
-- manufacturing-demo-seed が入れた 1 段フロー（第一承認グループ）をそのまま
-- スナップショットにする — 実データと同じ形にしておかないと Stepper が
-- 描けない。グループ id は serial なので名前で引く。
INSERT INTO app.approval_requests (id, target_type, target_id, step_no, step_count,
  group_id, mode, flow_snapshot, status, requested_by, requested_at, notes)
SELECT
  v.id::uuid, v.target_type, v.target_id, 1, 1,
  g.id, 'ANY'::app."APPROVAL_MODE",
  jsonb_build_array(jsonb_build_object(
    'stepNo', 1,
    'name', jsonb_build_object('ja', '第一承認', 'en', 'First approval'),
    'groupId', g.id,
    'groupName', g.name,
    'mode', 'ANY'
  )),
  v.status::app."APPROVAL_REQUEST_STATUS",
  'a0b1c2d3-0000-4000-8000-000000005107'::uuid, v.requested_at::timestamptz, NULL
FROM (VALUES
  ('db400000-0000-4000-8000-000000000001', 'purchase_requests',
   'PRQ-202607-00001', 'PENDING',  '2026-07-02T09:30:00+09'),
  ('db400000-0000-4000-8000-000000000002', 'purchase_requests',
   'PRQ-202607-00002', 'APPROVED', '2026-07-03T10:30:00+09'),
  ('db400000-0000-4000-8000-000000000003', 'material_purchase_orders',
   'PO-202607-00002',  'PENDING',  '2026-07-11T10:00:00+09'),
  ('db400000-0000-4000-8000-000000000004', 'material_purchase_orders',
   'PO-202607-00001',  'APPROVED', '2026-07-08T10:00:00+09')
) AS v(id, target_type, target_id, status, requested_at)
CROSS JOIN (
  SELECT id, name FROM app.approval_groups WHERE name->>'ja' = '第一承認グループ（デモ）'
) AS g
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.approval_records (id, approval_request_id, approver_id,
  delegate_for_id, action, comment, acted_at)
VALUES
  ('db410000-0000-4000-8000-000000000001'::uuid,
   'db400000-0000-4000-8000-000000000002'::uuid,
   '00000000-0000-0000-0000-000000000000'::uuid, NULL,
   'APPROVED'::app."APPROVAL_ACTION", '在庫僅少のため承認', '2026-07-04T11:00:00+09'),
  ('db410000-0000-4000-8000-000000000002'::uuid,
   'db400000-0000-4000-8000-000000000004'::uuid,
   '00000000-0000-0000-0000-000000000000'::uuid, NULL,
   'APPROVED'::app."APPROVAL_ACTION", NULL, '2026-07-09T09:30:00+09')
ON CONFLICT (id) DO NOTHING;

-- ── user_plants は不要（結論メモ）────────────────────────────────────────────
-- demo_shot のロールは staff（rbac-seed.sql）で、purchase_order /
-- material_receipt / outsource_order を含む全業務コードが scope 'ALL' —
-- PLANT スコープは production/quality 等の部門ロール（roles-seed.sql）のみ。
-- また購買 3 画面の data.ts は findMany に拠点スコープ条件を付けていない。
-- したがって app.user_plants への行追加は行わない。

COMMIT;
