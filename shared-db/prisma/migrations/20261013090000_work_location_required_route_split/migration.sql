-- 工程ごとの「作業計画に作業場所が要るか」+ 既存の工程リストを 準備 / 製造 に分ける。
--
-- ■ work_location_required（工程マスタ）
-- 承認前の作業計画は 日付 + 作業場所（§7）だが、在庫を動かすだけの工程
-- （〇〇出し）のように場所に意味の無い工程がある。工程ごとに外せるようにする。
-- 既定は true（= これまでの「全部の社内工程で要る」と同じ）。判定は
-- nextjs-web lib/work-plan-core.ts planReadiness が唯一の定義。
-- 使える場所の**範囲**は別の表（process_step_work_locations の許可リスト）で、
-- こちらは要る / 要らない だけ。
ALTER TABLE "app"."process_step_catalog"
  ADD COLUMN "work_location_required" BOOLEAN NOT NULL DEFAULT true;

-- ■ 既存の工程リストの分割（20261012090000 で kind を足したあとの一括処理）
--
-- 移行前の製造工程リスト（全部 MANUFACTURING）の版には準備工程が混ざっている。
-- 版そのものは書き換えない — 使用済みの指示書がその版を指していて、出所を
-- 嘘にするわけにいかない。代わりに:
--
--   1. 各ルートの**最新版**に混ざっている準備工程の並びを集め、並びごとに 1 本の
--      準備工程リスト（kind = PREP・共通）を作る。同じ並びは 1 本にまとめる —
--      製品ごとに同じ 5 工程を持たせないのがそもそもの目的。
--   2. 最新版に準備工程が混ざっているルートには、製造工程だけを持つ新しい版を
--      1 つ足す（備考に出どころを残す）。指示書ビルダーが既定で最新版を選ぶので、
--      次に作る指示書からは 準備工程リスト + 製造だけの版 の組になる。
--   3. 既存の指示書は、指している版の準備工程の並びが 1 で作った準備工程リストと
--      一致すれば prep_route_version_id を張る（出所の表示用。工程は動かさない）。
--
-- 準備工程の判定はアプリ側（category = MATERIAL_PREP）と同じ条件をここでも使う。
-- 準備工程しか無い版（= 製造工程ゼロ）にも製造だけの版は作らない（空の版になる）。
--
-- 全部 1 トランザクション（Prisma が migration ごとに張る）。冪等ではないが、
-- 一度しか当たらない（_prisma_migrations）。

DO $$
DECLARE
  r RECORD;
  prep_route_id INT;
  prep_version_id UUID;
  n INT := 0;
BEGIN
  -- 一時表: 各版の準備工程の並び（キー = 工程 id を sort_order 順に並べた文字列）
  CREATE TEMP TABLE _prep_seq ON COMMIT DROP AS
  SELECT v.id AS version_id,
         v.route_id,
         string_agg(s.process_step_id::text, ',' ORDER BY s.sort_order) AS seq_key
  FROM app.product_process_route_versions v
  JOIN app.product_process_route_version_steps s ON s.route_version_id = v.id
  JOIN app.process_step_catalog c ON c.id = s.process_step_id
  WHERE c.category = 'MATERIAL_PREP'
  GROUP BY v.id, v.route_id;

  -- 並び → 作った準備工程リストの版
  CREATE TEMP TABLE _prep_map (seq_key TEXT PRIMARY KEY, version_id UUID NOT NULL) ON COMMIT DROP;

  -- 1. 最新版に出てくる並びごとに準備工程リストを作る
  FOR r IN
    SELECT DISTINCT p.seq_key
    FROM _prep_seq p
    JOIN app.product_process_route_versions v ON v.id = p.version_id
    WHERE v.version = (SELECT max(version) FROM app.product_process_route_versions x WHERE x.route_id = v.route_id)
    ORDER BY p.seq_key
  LOOP
    n := n + 1;
    INSERT INTO app.product_process_routes (kind, product_id, customer_bp_id, name, is_active, notes, created_at, updated_at)
    VALUES ('PREP', NULL, NULL,
            jsonb_build_object('ja', '準備工程 ' || n, 'en', 'Preparation ' || n),
            true,
            '工程リストの分割（20261013）で既存の製造工程リストから切り出した',
            now(), now())
    RETURNING id INTO prep_route_id;

    INSERT INTO app.product_process_route_versions (route_id, version, notes, created_at)
    VALUES (prep_route_id, 1, '既存の工程リストから切り出し', now())
    RETURNING id INTO prep_version_id;

    -- 並びの元になった版のうち 1 つから工程行を写す（同じ並びなら同じ工程）
    INSERT INTO app.product_process_route_version_steps
      (route_version_id, process_step_id, sort_order, execution_location, plant_id, supplier_bp_id, work_hours, lot_input_mode)
    SELECT prep_version_id, s.process_step_id,
           row_number() OVER (ORDER BY s.sort_order) - 1,
           s.execution_location, s.plant_id, s.supplier_bp_id, s.work_hours, s.lot_input_mode
    FROM app.product_process_route_version_steps s
    JOIN app.process_step_catalog c ON c.id = s.process_step_id AND c.category = 'MATERIAL_PREP'
    WHERE s.route_version_id = (SELECT version_id FROM _prep_seq WHERE seq_key = r.seq_key ORDER BY version_id LIMIT 1);

    INSERT INTO _prep_map VALUES (r.seq_key, prep_version_id);
  END LOOP;

  -- 2. 最新版に準備工程が混ざっているルートへ、製造工程だけの新しい版を足す
  FOR r IN
    SELECT v.id AS version_id, v.route_id, v.version
    FROM app.product_process_route_versions v
    JOIN _prep_seq p ON p.version_id = v.id
    WHERE v.version = (SELECT max(version) FROM app.product_process_route_versions x WHERE x.route_id = v.route_id)
      AND EXISTS (
        SELECT 1 FROM app.product_process_route_version_steps s
        JOIN app.process_step_catalog c ON c.id = s.process_step_id
        WHERE s.route_version_id = v.id AND c.category <> 'MATERIAL_PREP'
      )
  LOOP
    INSERT INTO app.product_process_route_versions (route_id, version, notes, created_at)
    VALUES (r.route_id, r.version + 1,
            'v' || r.version || ' から準備工程を準備工程リストへ分離（20261013）', now())
    RETURNING id INTO prep_version_id;  -- 変数を使い回す（ここでは製造だけの版の id）

    INSERT INTO app.product_process_route_version_steps
      (route_version_id, process_step_id, sort_order, execution_location, plant_id, supplier_bp_id, work_hours, lot_input_mode)
    SELECT prep_version_id, s.process_step_id,
           row_number() OVER (ORDER BY s.sort_order) - 1,
           s.execution_location, s.plant_id, s.supplier_bp_id, s.work_hours, s.lot_input_mode
    FROM app.product_process_route_version_steps s
    JOIN app.process_step_catalog c ON c.id = s.process_step_id AND c.category <> 'MATERIAL_PREP'
    WHERE s.route_version_id = r.version_id;

    UPDATE app.product_process_routes SET updated_at = now() WHERE id = r.route_id;
  END LOOP;

  -- 3. 既存の指示書に準備工程リストの出所を張る（並びが一致するものだけ）
  UPDATE app.work_orders w
  SET prep_route_version_id = m.version_id
  FROM _prep_seq p
  JOIN _prep_map m ON m.seq_key = p.seq_key
  WHERE w.route_version_id = p.version_id
    AND w.prep_route_version_id IS NULL;
END $$;
