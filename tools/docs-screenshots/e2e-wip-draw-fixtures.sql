-- e2e-wip-draw-fixtures.sql — 在庫の仕掛品から指示書を始める通し確認
-- （e2e-wip-draw.ts。仕掛品の再設計 PR 5）のための状態を作る。
--
-- デモシードの仕掛品は 1 製品（9001 超硬エンドミル φ6×60）ぶんしか無く、
-- 「別の製品のために作りかけた品を使い回す」を試せない。ここで足す:
--
--   1. 製品 9201「超硬ドリル 2枚刃 φ6×60」— 9001 と同じ材種・径・長を要求する
--      **別の製品**。製造工程リスト 9201 v1 = 段加工 → 段加工検査 → 段加工検査承認。
--      準備工程リスト（デモシードの共通 9002: 素材出し → 切断 → センタレス →
--      全長合わせ）と合わせて指示書の工程になる。
--   2. 仕掛品 3 本（すべて目標製品は 9201 **ではない**）:
--        B  φ6×60 / [切断, センタレス, 全長合わせ] / 5 本 — ちょうど。3 工程を飛ばせる
--        C  φ6×80 / [切断, センタレス]             / 4 本 — 長い。全長合わせは残る
--        D  φ8×60 / [切断]                         / 3 本 — 太い
--      デモシードの 2 本（未加工 2 本 = ちょうど / [切断, センタレス, 段加工] 3 本 =
--      全長合わせが抜けていて先頭部分にならない → その他）と合わせて 4 区分が揃う。
--   3. demo1 を指示書の承認グループ（第一・第二）に入れる — 承認まで画面で通すため。
--
-- 何度流しても同じ結果になるよう、先に消してから作る。**指示書は作らない** —
-- そこは試験が画面から作って、台帳が正しく動くかを見る対象そのものなので。
--
-- 使う既存データ（デモシード）: 拠点 1 (F01) / 材種 1 / 製品 9001・9003 /
-- 作成者 a0b1c2d3-…-5107 / 準備工程リスト 9002。

-- ── 後始末（前回の試験が作った指示書・伝票・予約も含めて消す）──────────────
-- 指示書の入出庫伝票の source_id はロット番号（指示書番号の通し連番）。書類番号は
-- DB が振るので、指示書は製品（9201）で探す。
DELETE FROM app.inventory_transactions t
 USING app.inventory_movements m, app.work_orders w
 WHERE t.movement_id = m.id
   AND m.source_type = 'work_orders'
   AND m.source_id IN (w.work_order_number::text, w.doc_ref)
   AND w.product_item_id = 9201;
DELETE FROM app.inventory_movements m
 USING app.work_orders w
 WHERE m.source_type = 'work_orders'
   AND m.source_id IN (w.work_order_number::text, w.doc_ref)
   AND w.product_item_id = 9201;
DELETE FROM app.inventory_reservations r
 USING app.work_orders w
 WHERE r.work_order_id = w.id AND w.product_item_id = 9201;
DELETE FROM app.approval_requests a
 USING app.work_orders w
 WHERE a.target_type = 'work_orders'
   AND a.target_id IN (w.work_order_number::text, w.doc_ref)
   AND w.product_item_id = 9201;
DELETE FROM app.item_inventory WHERE item_id = 9201 OR aimed_item_id = 9201;
DELETE FROM app.work_orders WHERE product_item_id = 9201;
DELETE FROM app.inventory_transactions
 WHERE inventory_id IN ('dc0f0000-0000-4000-8000-000000000001',
                        'dc0f0000-0000-4000-8000-000000000002',
                        'dc0f0000-0000-4000-8000-000000000003');
DELETE FROM app.item_inventory
 WHERE id IN ('dc0f0000-0000-4000-8000-000000000001',
              'dc0f0000-0000-4000-8000-000000000002',
              'dc0f0000-0000-4000-8000-000000000003');
DELETE FROM app.product_process_routes WHERE id = 9201;
DELETE FROM app.items WHERE id = 9201;

-- ── 1. 別の製品と、その製造工程リスト ────────────────────────────────────────
INSERT INTO app.items (id, item_type, code, name, unit, year_month, seq,
                       requires_material_type_id, requires_diameter_mm, requires_length_mm,
                       updated_at)
VALUES (9201, 'PRODUCT', 'PRD-209911-0001',
        '{"ja": "超硬ドリル 2枚刃 φ6×60", "en": "Carbide drill 2FL φ6×60"}',
        '本', '209911', 1, 1, 6, 60, now());

INSERT INTO app.product_process_routes (id, name, is_active, created_by, kind, item_id, updated_at)
VALUES (9201, '{"ja": "標準工程（ドリル）", "en": "Standard route (drill)"}', true,
        'a0b1c2d3-0000-4000-8000-000000005107', 'MANUFACTURING', 9201, now());
INSERT INTO app.product_process_route_versions (id, route_id, version, created_by)
VALUES ('dc040000-0000-4000-8000-000000009201', 9201, 1,
        'a0b1c2d3-0000-4000-8000-000000005107');
-- 拠点は入れない: 社内でしか行わない工程は拠点を持たない形が正（ビルダーの
-- スナップショットと同じ形でないと、開いただけで「構成を変えた」ことになる）。
INSERT INTO app.product_process_route_version_steps
  (id, route_version_id, process_step_id, sort_order, execution_location, plant_id, work_hours)
VALUES
  ('dc041000-0000-4000-8000-000000009201', 'dc040000-0000-4000-8000-000000009201', 13, 1, 'INTERNAL', NULL, 4.00),
  ('dc041000-0000-4000-8000-000000009202', 'dc040000-0000-4000-8000-000000009201', 14, 2, 'INTERNAL', NULL, 1.00),
  ('dc041000-0000-4000-8000-000000009203', 'dc040000-0000-4000-8000-000000009201', 15, 3, 'INTERNAL', NULL, NULL);

-- ── 2. 仕掛品（仕掛ブランク × 加工状態。目標製品は 9201 ではない）──────────
-- ブランク品目と加工状態は DB の関数で引く（無ければ作る）— アプリの計上と同じ入口。
INSERT INTO app.item_inventory
  (id, item_id, plant_id, lot_number, quantity, reserved_quantity, unit,
   wip_state_id, aimed_item_id, finished_diameter_mm, finished_length_mm, updated_at)
VALUES
  ('dc0f0000-0000-4000-8000-000000000001',
   app.wip_blank_item_id(1, 6::numeric, 60::numeric), 1, 9004, 5, 0, '本',
   app.wip_state_id(ARRAY[5, 6, 10]), 9001, 6, 60, now() - interval '9 days'),
  ('dc0f0000-0000-4000-8000-000000000002',
   app.wip_blank_item_id(1, 6::numeric, 80::numeric), 1, 9004, 4, 0, '本',
   app.wip_state_id(ARRAY[5, 6]), 9001, 6, 80, now() - interval '6 days'),
  ('dc0f0000-0000-4000-8000-000000000003',
   app.wip_blank_item_id(1, 8::numeric, 60::numeric), 1, 9001, 3, 0, '本',
   app.wip_state_id(ARRAY[5]), 9003, 8, 60, now() - interval '3 days');

-- ── 3. 承認まで画面で通すため、demo1 を指示書の承認グループへ ────────────────
INSERT INTO app.approval_group_members (group_id, user_id, is_active)
SELECT g.group_id, u.id, true
  FROM (SELECT DISTINCT group_id FROM app.approval_flow_steps
         WHERE target_type = 'work_orders') g
 CROSS JOIN app.users u
 WHERE u.username = 'demo1'
ON CONFLICT (group_id, user_id) DO UPDATE SET is_active = true;
