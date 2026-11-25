-- 仕掛品の移行（20261126200000_wip_backfill）の DB 側の試験。
--
-- CI の migrate-deploy ジョブと tools/ci/local-check.sh（migrate_fresh）が、
-- まっさらな DB に migrate deploy した直後に `ON_ERROR_STOP=1` で流す。
-- 全体を 1 トランザクションにして最後に ROLLBACK するので DB には何も残らない。
--
-- 経路の表は nextjs-web src/lib/wip-state-core.test.ts の wipPathForSource と
-- 同じ形（推奨の経路だけ）。PL/pgSQL の app.wip_path_for_step はその双子なので、
-- 片方の規則を変えたら両方の表を直すこと。
--
-- カタログ工程の対応（TS の試験の id → 実カタログ）:
--   1 素材出し MATERIAL_ISSUE（開始工程・数えない） / 10 切断 CUTTING /
--   20 円筒 CYLINDER_MACHINING / 30 段加工 STEP_MACHINING /
--   40 検査 CYLINDER_INSPECTION（数えない） / 50 コーティング COATING /
--   60 手直し研削 → POST_CUTTING（加工・数える）

BEGIN;

CREATE TEMP TABLE c AS
SELECT
  (SELECT id FROM app.process_step_catalog WHERE code = 'MATERIAL_ISSUE')     AS s1,
  (SELECT id FROM app.process_step_catalog WHERE code = 'CUTTING')            AS s10,
  (SELECT id FROM app.process_step_catalog WHERE code = 'CYLINDER_MACHINING') AS s20,
  (SELECT id FROM app.process_step_catalog WHERE code = 'STEP_MACHINING')     AS s30,
  (SELECT id FROM app.process_step_catalog WHERE code = 'CYLINDER_INSPECTION') AS s40,
  (SELECT id FROM app.process_step_catalog WHERE code = 'COATING')            AS s50,
  (SELECT id FROM app.process_step_catalog WHERE code = 'POST_CUTTING')       AS s60,
  (SELECT min(id) FROM app.material_types)                                    AS mt;

-- 品目: 製品（要求 φ6 × 75）/ 素材（φ6.2 × 310）/ 寸法の無い製品
INSERT INTO app.items (id, item_type, code, name, unit, requires_material_type_id,
                       requires_diameter_mm, requires_length_mm, updated_at)
SELECT 990001, 'PRODUCT', 'WIPT-P1', '{"ja":"試験製品"}', '本', c.mt, 6, 75, now() FROM c;
INSERT INTO app.items (id, item_type, code, name, unit, updated_at)
VALUES (990002, 'PRODUCT', 'WIPT-P2', '{"ja":"寸法なし製品"}', '本', now());
INSERT INTO app.items (id, item_type, code, name, unit, material_type_id,
                       diameter_mm, length_mm, updated_at)
SELECT 990003, 'MATERIAL', 'WIPT-M1', '{"ja":"試験素材"}', '本', c.mt, 6.2, 310, now() FROM c;

-- 指示書を 1 本作る小道具（工程は呼び出し側）
CREATE FUNCTION pg_temp.wo(p_id uuid, p_no int, p_product int, p_material int) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO app.work_orders (id, work_order_number, product_item_id,
                               material_item_id, type, planned_quantity, updated_at)
  VALUES (p_id, p_no, p_product, p_material, 'MANUFACTURE', 10, now())
$$;
CREATE FUNCTION pg_temp.st(p_wo uuid, p_id uuid, p_cat int, p_sort int, p_status text,
                           p_defect_semi int DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO app.work_order_steps (id, work_order_id, process_step_id, sort_order,
                                    execution_location, status, output_defect_semi_finished)
  VALUES (p_id, p_wo, p_cat, p_sort, 'INTERNAL', p_status::app."STEP_STATUS", p_defect_semi)
$$;
CREATE FUNCTION pg_temp.ln(p_wo uuid, p_src uuid, p_tgt uuid, p_q int) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO app.work_order_step_links (id, work_order_id, source_step_id, target_step_id, routed_quantity)
  VALUES (gen_random_uuid(), p_wo, p_src, p_tgt, p_q)
$$;

\o /dev/null
-- ── A: 本流（素材出し → 切断 → 円筒 → 検査 → 段加工(未着手)）─────────────────
SELECT pg_temp.wo('a0000000-0000-4000-8000-00000000000a', 990101, 990001, 990003);
SELECT pg_temp.st('a0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001', c.s1, 0, 'COMPLETED') FROM c;
SELECT pg_temp.st('a0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000002', c.s10, 10, 'COMPLETED') FROM c;
SELECT pg_temp.st('a0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000003', c.s20, 20, 'COMPLETED', 2) FROM c;
SELECT pg_temp.st('a0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000004', c.s40, 30, 'COMPLETED') FROM c;
SELECT pg_temp.st('a0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000005', c.s30, 40, 'PENDING') FROM c;

\o
DO $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM c;
  -- 本流: 開始工程と検査を除いた、数える工程だけを早い順に
  ASSERT app.wip_path_for_step('a0000000-0000-4000-8000-000000000004', true) = ARRAY[c.s10, c.s20],
    'A insp: ' || app.wip_path_for_step('a0000000-0000-4000-8000-000000000004', true)::text;
  ASSERT app.wip_path_for_step('a0000000-0000-4000-8000-000000000003', true) = ARRAY[c.s10, c.s20], 'A cyl';
  -- includeSource=false は発生元を済んだことにしない
  ASSERT app.wip_path_for_step('a0000000-0000-4000-8000-000000000003', false) = ARRAY[c.s10], 'A cyl excl';
  -- 知らない工程は NULL
  ASSERT app.wip_path_for_step('a0000000-0000-4000-8000-0000000000ff', true) IS NULL, 'unknown step';
END $$;

-- CANCELLED の工程は通っていない
UPDATE app.work_order_steps SET status = 'CANCELLED' WHERE id = 'a0000000-0000-4000-8000-000000000002';
DO $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM c;
  ASSERT app.wip_path_for_step('a0000000-0000-4000-8000-000000000004', true) = ARRAY[c.s20], 'A cancelled';
END $$;
UPDATE app.work_order_steps SET status = 'COMPLETED' WHERE id = 'a0000000-0000-4000-8000-000000000002';

\o /dev/null
-- ── B: 分岐系列（円筒の工程分岐 → 手直し研削 → コーティングで半製品在庫へ）───
SELECT pg_temp.wo('b0000000-0000-4000-8000-00000000000b', 990102, 990001, 990003);
SELECT pg_temp.st('b0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000001', c.s1, 0, 'COMPLETED') FROM c;
SELECT pg_temp.st('b0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000002', c.s10, 10, 'COMPLETED') FROM c;
SELECT pg_temp.st('b0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000003', c.s20, 20, 'COMPLETED') FROM c;
SELECT pg_temp.st('b0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000004', c.s40, 30, 'COMPLETED') FROM c;
SELECT pg_temp.st('b0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000005', c.s30, 40, 'PENDING') FROM c;
SELECT pg_temp.st('b0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000006', c.s60, 50, 'COMPLETED') FROM c;
SELECT pg_temp.st('b0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000007', c.s50, 60, 'COMPLETED') FROM c;
SELECT pg_temp.ln('b0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000006', 2);
SELECT pg_temp.ln('b0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000007', 0);
\o

DO $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM c;
  ASSERT app.wip_path_for_step('b0000000-0000-4000-8000-000000000007', true)
         = ARRAY[c.s10, c.s20, c.s60, c.s50],
    'B branch: ' || app.wip_path_for_step('b0000000-0000-4000-8000-000000000007', true)::text;
END $$;

\o /dev/null
-- ── C: 合流後（推奨は本流 — 合流してきた手直し研削は辿らない）─────────────────
SELECT pg_temp.wo('c0000000-0000-4000-8000-00000000000c', 990103, 990001, NULL);
SELECT pg_temp.st('c0000000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-000000000001', c.s1, 0, 'COMPLETED') FROM c;
SELECT pg_temp.st('c0000000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-000000000002', c.s10, 10, 'COMPLETED') FROM c;
SELECT pg_temp.st('c0000000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-000000000003', c.s20, 20, 'COMPLETED') FROM c;
SELECT pg_temp.st('c0000000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-000000000004', c.s30, 40, 'COMPLETED', 1) FROM c;
SELECT pg_temp.st('c0000000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-000000000005', c.s60, 50, 'COMPLETED') FROM c;
SELECT pg_temp.ln('c0000000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000005', 2);
SELECT pg_temp.ln('c0000000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000004', 0);
\o

DO $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM c;
  ASSERT app.wip_path_for_step('c0000000-0000-4000-8000-000000000004', true)
         = ARRAY[c.s10, c.s20, c.s30],
    'C merge: ' || app.wip_path_for_step('c0000000-0000-4000-8000-000000000004', true)::text;
END $$;

-- ── 行き先（旧来の鍵 → 仕掛品の鍵）と、旧来の形で書かれた行の書き換え ──────────
--
-- 旧アプリと同じ形（item_id = 製品・wip_state_id なし）で INSERT すると、
-- トリガーが移行と同じ関数で書き換える。CHECK も満たすこと。
INSERT INTO app.item_inventory (id, item_id, lot_number, is_semi_finished, source_step_id, quantity, unit, updated_at)
SELECT v.*, now() FROM (VALUES
  -- A 円筒の途中で半製品（DEFECT → 円筒は済んでいない）
  ('e0000000-0000-4000-8000-000000000001'::uuid, 990001, 990101, true, 'a0000000-0000-4000-8000-000000000003'::uuid, 2, '本'),
  -- B 分岐終端（BRANCH_TERMINAL → 終端の工程も済み）
  ('e0000000-0000-4000-8000-000000000002', 990001, 990102, true, 'b0000000-0000-4000-8000-000000000007', 3, '本'),
  -- C 素材の無い指示書 → 製品の requires_* に落ちる
  ('e0000000-0000-4000-8000-000000000003', 990001, 990103, true, 'c0000000-0000-4000-8000-000000000004', 1, '本'),
  -- 推定できない: ロット無し / 発生工程無し / 製品に寸法が無い
  ('e0000000-0000-4000-8000-000000000004', 990001, NULL,   true, NULL, 5, '本'),
  ('e0000000-0000-4000-8000-000000000005', 990001, 990101, true, NULL, 6, '本'),
  ('e0000000-0000-4000-8000-000000000006', 990002, 990101, true, 'a0000000-0000-4000-8000-000000000003', 7, '本'),
  -- 半製品でない行は触らない
  ('e0000000-0000-4000-8000-000000000007', 990001, 990101, false, NULL::uuid, 9, '本')
) v(id, item_id, lot_number, is_semi_finished, source_step_id, quantity, unit);

DO $$
DECLARE
  c record;
  r record;
  blank_a int;
  blank_c int;
  legacy int := (SELECT id FROM app.wip_states WHERE signature = 'legacy:unclassified');
BEGIN
  SELECT * INTO c FROM c;
  ASSERT legacy IS NOT NULL, 'unclassified state exists';
  ASSERT (SELECT is_legacy FROM app.wip_states WHERE id = legacy), 'unclassified is legacy';

  -- ブランク: 材種・径は素材から（φ6.2）、長さは製品の要求長（75）
  SELECT id INTO blank_a FROM app.items
   WHERE item_type = 'BLANK' AND material_type_id = c.mt AND diameter_mm = 6.2 AND length_mm = 75;
  ASSERT blank_a IS NOT NULL, 'blank φ6.2×75 created';
  -- 素材の無い指示書は製品の要求径（φ6）
  SELECT id INTO blank_c FROM app.items
   WHERE item_type = 'BLANK' AND material_type_id = c.mt AND diameter_mm = 6 AND length_mm = 75;
  ASSERT blank_c IS NOT NULL, 'blank φ6×75 from requires_*';

  SELECT ii.item_id, ii.aimed_item_id, ws.step_ids, ws.is_legacy INTO r
    FROM app.item_inventory ii JOIN app.wip_states ws ON ws.id = ii.wip_state_id
   WHERE ii.id = 'e0000000-0000-4000-8000-000000000001';
  ASSERT r.item_id = blank_a AND r.aimed_item_id = 990001, 'A target';
  ASSERT r.step_ids = ARRAY[c.s10] AND NOT r.is_legacy, 'A DEFECT excludes source: ' || r.step_ids::text;

  SELECT ii.item_id, ws.step_ids INTO r
    FROM app.item_inventory ii JOIN app.wip_states ws ON ws.id = ii.wip_state_id
   WHERE ii.id = 'e0000000-0000-4000-8000-000000000002';
  ASSERT r.item_id = blank_a, 'B shares the blank';
  ASSERT r.step_ids = ARRAY[c.s10, c.s20, c.s60, c.s50], 'B BRANCH_TERMINAL includes source';

  SELECT ii.item_id, ws.step_ids INTO r
    FROM app.item_inventory ii JOIN app.wip_states ws ON ws.id = ii.wip_state_id
   WHERE ii.id = 'e0000000-0000-4000-8000-000000000003';
  ASSERT r.item_id = blank_c, 'C fallback blank';
  ASSERT r.step_ids = ARRAY[c.s10, c.s20], 'C DEFECT on merged step: ' || r.step_ids::text;

  -- 推定できない行は製品のまま「未分類」
  FOR r IN SELECT id, item_id, aimed_item_id, wip_state_id FROM app.item_inventory
            WHERE id IN ('e0000000-0000-4000-8000-000000000004',
                         'e0000000-0000-4000-8000-000000000005',
                         'e0000000-0000-4000-8000-000000000006')
  LOOP
    ASSERT r.wip_state_id = legacy, 'unresolvable -> unclassified: ' || r.id;
    ASSERT r.item_id = r.aimed_item_id, 'unresolvable keeps the product: ' || r.id;
  END LOOP;

  -- 半製品でない行は触らない
  SELECT item_id, wip_state_id, aimed_item_id INTO r FROM app.item_inventory
   WHERE id = 'e0000000-0000-4000-8000-000000000007';
  ASSERT r.item_id = 990001 AND r.wip_state_id IS NULL AND r.aimed_item_id IS NULL, 'normal row untouched';

  -- 同じ並びは 1 行に寄る（署名 = wipSignature）
  ASSERT (SELECT count(*) FROM app.wip_states WHERE signature = c.s10::text) = 1, 'signature dedup';
  ASSERT (SELECT signature FROM app.wip_states WHERE step_ids = ARRAY[c.s10, c.s20])
         = c.s10 || ',' || c.s20, 'signature format';
END $$;

-- 同じ旧来の鍵をもう一度 INSERT すると、同じ仕掛品の鍵に当たって一意制約で落ちる
-- （= アプリは先に app.wip_legacy_bucket で行き先を解いて既存行を探し当てる）。
DO $$
DECLARE
  raised boolean := false;
  b record;
BEGIN
  BEGIN
    INSERT INTO app.item_inventory (item_id, lot_number, is_semi_finished, source_step_id, quantity, unit, updated_at)
    VALUES (990001, 990101, true, 'a0000000-0000-4000-8000-000000000003', 1, '本', now());
  EXCEPTION WHEN unique_violation THEN
    raised := true;
  END;
  ASSERT raised, 'same legacy key resolves to the same bucket';

  SELECT * INTO b FROM app.wip_legacy_bucket(990001, 990101, 'a0000000-0000-4000-8000-000000000003');
  ASSERT EXISTS (
    SELECT 1 FROM app.item_inventory
     WHERE id = 'e0000000-0000-4000-8000-000000000001'
       AND item_id = b.item_id AND wip_state_id = b.wip_state_id AND aimed_item_id = b.aimed_item_id
  ), 'wip_legacy_bucket returns the existing bucket';

  -- 既にブランクになった行の付け替え（旧アプリの在庫移動）は、ロットの製品を目標にする
  SELECT * INTO b FROM app.wip_legacy_bucket(
    (SELECT item_id FROM app.item_inventory WHERE id = 'e0000000-0000-4000-8000-000000000001'),
    990101, 'a0000000-0000-4000-8000-000000000003');
  ASSERT b.aimed_item_id = 990001, 'blank input aims at the lot product';
END $$;

-- 不変条件: 半製品 ⇔ 加工状態（20261126270000_wip_cleanup から、印はトリガーが
-- 加工状態から埋め直す — アプリは is_semi_finished を書かない）。
DO $$
DECLARE
  st int := (SELECT min(id) FROM app.wip_states);
  v boolean;
BEGIN
  -- 加工状態を付けると印が立つ（CHECK に当たらない）
  UPDATE app.item_inventory SET wip_state_id = st
   WHERE id = 'e0000000-0000-4000-8000-000000000007';
  SELECT is_semi_finished INTO v FROM app.item_inventory
   WHERE id = 'e0000000-0000-4000-8000-000000000007';
  ASSERT v, 'wip state sets is_semi_finished';

  -- 印を書かない新しい形の INSERT（既定 false で来る）でも印が立つ
  INSERT INTO app.item_inventory (id, item_id, lot_number, wip_state_id, aimed_item_id,
                                  quantity, unit, updated_at)
  VALUES ('e0000000-0000-4000-8000-0000000000aa', 990002, 990199, st, 990002, 1, '本', now());
  SELECT is_semi_finished INTO v FROM app.item_inventory
   WHERE id = 'e0000000-0000-4000-8000-0000000000aa';
  ASSERT v, 'new-shape insert gets is_semi_finished from wip_state_id';

  -- 加工状態を外すと印も落ちる
  UPDATE app.item_inventory SET wip_state_id = NULL, aimed_item_id = NULL
   WHERE id = 'e0000000-0000-4000-8000-0000000000aa';
  SELECT is_semi_finished INTO v FROM app.item_inventory
   WHERE id = 'e0000000-0000-4000-8000-0000000000aa';
  ASSERT NOT v, 'clearing the wip state clears is_semi_finished';
END $$;

ROLLBACK;
