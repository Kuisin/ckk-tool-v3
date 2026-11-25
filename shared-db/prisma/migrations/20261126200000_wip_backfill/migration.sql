-- 仕掛品の再設計 第 2 段（PR 2/7）: 既存の半製品をその場で仕掛品の形へ移す。
--
-- 第 1 段（20261126170000_wip_state_core）で入れ物（wip_states・BLANK 品目・
-- item_inventory の 4 列）を作った。ここでは
--   1. 旧来の半製品行（is_semi_finished = true, wip_state_id IS NULL）を
--      **uuid を変えずに**書き換える:
--        aimed_item_id = 旧 item_id（目標製品）
--        item_id       = 仕掛ブランク（材種 × 径 × 長。無ければ作る）
--        wip_state_id  = 発生工程から推定した加工状態（署名で寄せる）
--      推定できない行（ロット無し・発生工程無し・材種/径/長が決まらない）は
--      item_id を製品のまま残し、1 行だけの「未分類」状態（is_legacy = true）を指す。
--      仕上がり寸法は移行では埋めない（NULL のまま — 記録されていない値を作らない）。
--   2. `is_semi_finished = (wip_state_id IS NOT NULL)` の CHECK を張る。
--
-- ★ 在庫の数は 1 本も動かさない。行の uuid を保つので inventory_transactions /
--   inventory_reservations の inventory_id はそのまま指し続ける。移行の前後で
--   行ごとの数量・引当・単位・場所が同じことをこのファイルの中で確かめ、違えば
--   移行ごと落とす（下の「整合の確認」）。
--
-- ★ 計上の切り替え（発生工程ごとに別バケット・仕上がり寸法の入力）は次の段。
--   この段のアプリは従来どおり「製品 × ロット × 半製品」で 1 本のバケットに
--   積むので、その行き先を DB の関数 app.wip_legacy_bucket が決める:
--     - 新しいアプリ（lib/inventory.ts ensureItemInventory）は鍵を引く前にこの
--       関数で行き先を解決する（同じ行を探し当てるため）。
--     - **スキーマが先に着いて旧アプリがまだ動いている間**は、旧アプリが旧来の
--       形のまま INSERT してくる。CHECK で落とすと指示書の完了が止まるので、
--       BEFORE トリガー（item_inventory_wip_legacy）が同じ関数で書き換える。
--   どちらも同じ関数を通るので、移行・新アプリ・旧アプリの行き先が割れない。
--
-- 加工状態の推定は nextjs-web lib/wip-state-core.ts wipPathForSource の**推奨の
-- 経路**（合流では本流を辿る）と同じ規則を PL/pgSQL で書いたもの（双子）。
-- 規則の表は shared-db/ci/sql-tests/wip-backfill.sql と wip-state-core.test.ts が
-- 同じ形を持つ。片方を直したらもう片方も直すこと。
--   - 途中で半製品に振り分けた分（発生工程に output_defect_semi_finished がある）は
--     発生工程を**済んだことにしない**（DEFECT）。
--   - それ以外（「半製品在庫へ」で終わる分岐の終端）は発生工程を含める（BRANCH_TERMINAL）。

-- ── 仕掛ブランク品目（材種 × 径 × 長 で 1 行）─────────────────────────────────
-- 一意性は items_blank_dimensions_key（部分 unique index）が持つ。同時に 2 本が
-- 作りに来ても ON CONFLICT で 1 本に寄る。
CREATE OR REPLACE FUNCTION "app".wip_blank_item_id(
  p_material_type_id int, p_diameter_mm numeric, p_length_mm numeric
) RETURNS int
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_id int;
  v_mt record;
  v_d text := trim_scale(p_diameter_mm::numeric(8,3))::text;
  v_l text := trim_scale(p_length_mm::numeric(10,3))::text;
  v_mt_label text;
BEGIN
  IF p_material_type_id IS NULL OR p_diameter_mm IS NULL OR p_length_mm IS NULL THEN
    RAISE EXCEPTION 'wip_blank_item_id: material type / diameter / length are required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT id INTO v_id FROM "app"."items"
   WHERE item_type = 'BLANK'
     AND material_type_id = p_material_type_id
     AND diameter_mm = p_diameter_mm::numeric(8,3)
     AND length_mm = p_length_mm::numeric(10,3);
  IF FOUND THEN RETURN v_id; END IF;

  SELECT id, code, name INTO v_mt FROM "app"."material_types" WHERE id = p_material_type_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wip_blank_item_id: material type % does not exist', p_material_type_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  v_mt_label := coalesce(v_mt.code, v_mt.name->>'ja', v_mt.id::text);

  INSERT INTO "app"."items" (item_type, code, name, unit, material_type_id,
                             diameter_mm, length_mm, updated_at)
  VALUES ('BLANK',
          'BLK-' || coalesce(v_mt.code, 'MT' || v_mt.id) || '-' || v_d || 'x' || v_l,
          jsonb_build_object(
            'ja', '仕掛ブランク ' || v_mt_label || ' φ' || v_d || '×' || v_l,
            'en', 'WIP blank ' || v_mt_label || ' φ' || v_d || '×' || v_l,
            'zh', '在制坯料 ' || v_mt_label || ' φ' || v_d || '×' || v_l),
          '本', p_material_type_id,
          p_diameter_mm::numeric(8,3), p_length_mm::numeric(10,3), CURRENT_TIMESTAMP)
  ON CONFLICT ("material_type_id", "diameter_mm", "length_mm") WHERE item_type = 'BLANK'
  DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT id INTO v_id FROM "app"."items"
   WHERE item_type = 'BLANK'
     AND material_type_id = p_material_type_id
     AND diameter_mm = p_diameter_mm::numeric(8,3)
     AND length_mm = p_length_mm::numeric(10,3);
  RETURN v_id;
END $$;

-- ── 加工状態（署名で寄せる）──────────────────────────────────────────────────
-- 署名は wip-state-core.ts wipSignature と同じ: カタログ id をカンマで並べる
-- （空 = 何も済んでいない）。
CREATE OR REPLACE FUNCTION "app".wip_state_id(p_step_ids int[])
RETURNS int
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_sig text := array_to_string(coalesce(p_step_ids, '{}'::int[]), ',');
  v_id int;
BEGIN
  INSERT INTO "app"."wip_states" (step_ids, signature)
  VALUES (coalesce(p_step_ids, '{}'::int[]), v_sig)
  ON CONFLICT (signature) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM "app"."wip_states" WHERE signature = v_sig;
  END IF;
  RETURN v_id;
END $$;

-- 「未分類」— 推定できなかった旧来の半製品が指す 1 行。署名は wipSignature が
-- 作れない文字列（数字とカンマ以外を含む）にして、本物の状態と決して重ならない
-- ようにする。並びは空で、突合（matchWip）は is_legacy の行を人の判断に回す。
CREATE OR REPLACE FUNCTION "app".wip_unclassified_state_id()
RETURNS int
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_id int;
BEGIN
  INSERT INTO "app"."wip_states" (step_ids, signature, name, is_legacy)
  VALUES ('{}'::int[], 'legacy:unclassified',
          '{"ja": "未分類", "en": "Unclassified", "zh": "未分类"}'::jsonb, true)
  ON CONFLICT (signature) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM "app"."wip_states" WHERE signature = 'legacy:unclassified';
  END IF;
  RETURN v_id;
END $$;

-- ── 工程グラフ（workflow-core の precedes / isOffMainline と同じ規則）───────────
-- 工程順は (sort_order, id)。id の比較は文字列の C 照合（JS の localeCompare と
-- uuid の小文字 16 進では同じ順になる）。
CREATE OR REPLACE FUNCTION "app".wip_step_precedes(
  a_sort int, a_id uuid, b_sort int, b_id uuid
) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT a_sort < b_sort
      OR (a_sort = b_sort AND (a_id::text COLLATE "C") < (b_id::text COLLATE "C"))
$$;

-- 分岐系列の工程か = 自分より手前に並ぶ工程から入ってくるリンクがある。
CREATE OR REPLACE FUNCTION "app".wip_step_off_mainline(p_step_id uuid)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
      FROM "app"."work_order_step_links" l
      JOIN "app"."work_order_steps" src ON src.id = l.source_step_id
      JOIN "app"."work_order_steps" me  ON me.id = l.target_step_id
     WHERE l.target_step_id = p_step_id
       AND src.work_order_id = me.work_order_id
       AND "app".wip_step_precedes(src.sort_order, src.id, me.sort_order, me.id)
  )
$$;

-- 発生工程までに品物が通った、加工状態に数える工程（カタログ id）の並び。
-- wipPathForSource の**推奨の経路**（深さ優先で最初に見つかる経路）だけを辿る:
--   手前の工程 = [推奨（本流なら直前の本流工程 / 分岐系列なら手前から入るリンクの元）]
--                + 入ってくるリンクの元（動的が先、工程順の後ろが先）
--   のうち、まだ辿っていない最初のもの。
-- 発生工程そのものは p_include_source に従い、それ以外の未着手・キャンセルの
-- 工程は品物が通っていないので数えない。発生工程が無ければ NULL。
CREATE OR REPLACE FUNCTION "app".wip_path_for_step(p_source uuid, p_include_source boolean)
RETURNS int[]
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_src  record;
  v_cur  record;
  v_prim uuid;
  v_next uuid;
  v_chain uuid[] := '{}';
  v_out int[] := '{}';
  v_i int;
  v_s record;
BEGIN
  SELECT id, work_order_id, sort_order INTO v_src
    FROM "app"."work_order_steps" WHERE id = p_source;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_cur := v_src;
  LOOP
    v_chain := v_chain || v_cur.id;
    EXIT WHEN cardinality(v_chain) > 1000;  -- 輪の保険（辿った工程は再訪しない）

    IF "app".wip_step_off_mainline(v_cur.id) THEN
      SELECT s.id INTO v_prim
        FROM "app"."work_order_step_links" l
        JOIN "app"."work_order_steps" s ON s.id = l.source_step_id
       WHERE l.target_step_id = v_cur.id
         AND s.work_order_id = v_src.work_order_id
         AND s.status <> 'CANCELLED'
         AND "app".wip_step_precedes(s.sort_order, s.id, v_cur.sort_order, v_cur.id)
       ORDER BY (l.routed_quantity > 0), s.sort_order DESC, (s.id::text COLLATE "C") DESC
       LIMIT 1;
    ELSE
      SELECT s.id INTO v_prim
        FROM "app"."work_order_steps" s
       WHERE s.work_order_id = v_src.work_order_id
         AND s.status <> 'CANCELLED'
         AND NOT "app".wip_step_off_mainline(s.id)
         AND "app".wip_step_precedes(s.sort_order, s.id, v_cur.sort_order, v_cur.id)
       ORDER BY s.sort_order DESC, (s.id::text COLLATE "C") DESC
       LIMIT 1;
    END IF;

    SELECT c.id INTO v_next FROM (
      SELECT v_prim AS id, 0 AS grp, 0 AS dyn, 0 AS so, ''::text AS sid
       WHERE v_prim IS NOT NULL
      UNION ALL
      SELECT s.id, 1, (l.routed_quantity > 0)::int, s.sort_order, s.id::text
        FROM "app"."work_order_step_links" l
        JOIN "app"."work_order_steps" s ON s.id = l.source_step_id
       WHERE l.target_step_id = v_cur.id
         AND s.work_order_id = v_src.work_order_id
         AND s.status <> 'CANCELLED'
    ) c
    WHERE NOT (c.id = ANY (v_chain))
    ORDER BY c.grp, c.dyn, c.so DESC, (c.sid COLLATE "C") DESC
    LIMIT 1;

    EXIT WHEN v_next IS NULL;
    SELECT id, work_order_id, sort_order INTO v_cur
      FROM "app"."work_order_steps" WHERE id = v_next;
    v_prim := NULL;
    v_next := NULL;
  END LOOP;

  -- 早い順（鎖の逆順）に並べ、加工状態に数える工程だけを残す。
  FOR v_i IN REVERSE cardinality(v_chain)..1 LOOP
    SELECT s.id, s.status, s.process_step_id, c.affects_wip_state INTO v_s
      FROM "app"."work_order_steps" s
      JOIN "app"."process_step_catalog" c ON c.id = s.process_step_id
     WHERE s.id = v_chain[v_i];
    IF v_s.id = p_source THEN
      CONTINUE WHEN NOT p_include_source;
    ELSIF v_s.status IN ('PENDING', 'CANCELLED') THEN
      CONTINUE;
    END IF;
    IF v_s.affects_wip_state THEN
      v_out := v_out || v_s.process_step_id;
    END IF;
  END LOOP;
  RETURN v_out;
END $$;

-- ── 旧来の半製品 1 行の行き先 ────────────────────────────────────────────────
-- 入力は旧来の鍵（製品・ロット・発生工程）。返すのは仕掛品の鍵の 3 列。
--   目標製品 = 旧 item_id（すでにブランクなら、そのロットの指示書の製品）
--   ブランク = 材種・径はロットの指示書の素材（material_item_id）から、長さは
--             製品の要求長（requires_length_mm）から。指示書に素材が無ければ
--             製品の requires_* に落ちる。
--   状態     = 発生工程からの経路（上の wip_path_for_step）。
-- どれかが決まらなければ item_id はそのまま、状態は「未分類」。
CREATE OR REPLACE FUNCTION "app".wip_legacy_bucket(
  p_item_id int, p_lot_number int, p_source_step_id uuid,
  OUT item_id int, OUT wip_state_id int, OUT aimed_item_id int
)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_item_type text;
  v_product int := p_item_id;
  v_wo_id uuid;
  v_wo_product int;
  v_wo_material int;
  v_defect int;
  v_req_mt int;
  v_req_d numeric;
  v_req_l numeric;
  v_mt int;
  v_d numeric;
  v_l numeric;
  v_path int[];
BEGIN
  SELECT i.item_type::text INTO v_item_type FROM "app"."items" i WHERE i.id = p_item_id;
  IF p_lot_number IS NOT NULL THEN
    SELECT w.id, w.product_item_id, w.material_item_id
      INTO v_wo_id, v_wo_product, v_wo_material
      FROM "app"."work_orders" w WHERE w.work_order_number = p_lot_number;
  END IF;
  IF v_item_type = 'BLANK' THEN
    v_product := v_wo_product;
  END IF;

  item_id := p_item_id;
  aimed_item_id := v_product;
  wip_state_id := "app".wip_unclassified_state_id();

  IF v_wo_id IS NULL OR p_source_step_id IS NULL OR v_product IS NULL THEN
    RETURN;
  END IF;
  SELECT coalesce(s.output_defect_semi_finished, 0) INTO v_defect
    FROM "app"."work_order_steps" s WHERE s.id = p_source_step_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT i.requires_material_type_id, i.requires_diameter_mm, i.requires_length_mm
    INTO v_req_mt, v_req_d, v_req_l
    FROM "app"."items" i WHERE i.id = v_product;
  IF v_wo_material IS NOT NULL THEN
    SELECT i.material_type_id, i.diameter_mm INTO v_mt, v_d
      FROM "app"."items" i WHERE i.id = v_wo_material;
  END IF;
  IF v_mt IS NULL OR v_d IS NULL THEN
    v_mt := v_req_mt;
    v_d := v_req_d;
  END IF;
  v_l := v_req_l;
  IF v_mt IS NULL OR v_d IS NULL OR v_l IS NULL THEN RETURN; END IF;

  -- DEFECT（途中で振り分けた分）は発生工程を含めない / 分岐終端は含める。
  v_path := "app".wip_path_for_step(p_source_step_id, v_defect = 0);
  IF v_path IS NULL THEN RETURN; END IF;

  item_id := "app".wip_blank_item_id(v_mt, v_d, v_l);
  wip_state_id := "app".wip_state_id(v_path);
END $$;

-- ── 旧アプリが旧来の形で書いてきた行を書き換える ─────────────────────────────
-- 加工状態を持たない半製品行だけ。仕掛品の計上（次の段）は wip_state_id を
-- 渡すので、このトリガーは素通りする。
CREATE OR REPLACE FUNCTION "app".item_inventory_wip_legacy() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM "app".wip_legacy_bucket(NEW.item_id, NEW.lot_number, NEW.source_step_id);
  NEW.item_id := r.item_id;
  NEW.wip_state_id := r.wip_state_id;
  NEW.aimed_item_id := r.aimed_item_id;
  RETURN NEW;
END $$;

CREATE TRIGGER "item_inventory_wip_legacy"
  BEFORE INSERT OR UPDATE ON "app"."item_inventory"
  FOR EACH ROW
  WHEN (NEW.is_semi_finished AND NEW.wip_state_id IS NULL)
  EXECUTE FUNCTION "app".item_inventory_wip_legacy();

-- ── 既存行の移行 ─────────────────────────────────────────────────────────────
-- 預り品（owner_bp_id）の半製品は仕掛品にできない（CHECK item_inventory_wip_not_owned）。
-- 再研磨は半製品を出さないので存在しないはずだが、あれば黙って形を変えずに
-- 理由を言って止める。
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM "app"."item_inventory"
   WHERE is_semi_finished AND owner_bp_id IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'wip backfill: % semi-finished row(s) belong to a customer (owner_bp_id); resolve them by hand first', n;
  END IF;
END $$;

CREATE TEMP TABLE "_wip_backfill_before" AS
SELECT id, quantity, reserved_quantity, unit, plant_id, lot_number,
       storage_location_id, shelf_id, custody_bp_id, owner_bp_id, source_step_id,
       item_id AS old_item_id
  FROM "app"."item_inventory"
 WHERE is_semi_finished AND wip_state_id IS NULL;

CREATE TEMP TABLE "_wip_backfill_tx_before" AS
SELECT inventory_type, inventory_id, transaction_type, count(*) AS n, sum(quantity) AS qty
  FROM "app"."inventory_transactions"
 GROUP BY inventory_type, inventory_id, transaction_type;

CREATE TEMP TABLE "_wip_backfill_count" AS
SELECT count(*) AS n, coalesce(sum(quantity), 0) AS qty, coalesce(sum(reserved_quantity), 0) AS reserved
  FROM "app"."item_inventory";

UPDATE "app"."item_inventory" ii
   SET (item_id, wip_state_id, aimed_item_id) =
       (SELECT b.item_id, b.wip_state_id, b.aimed_item_id
          FROM "app".wip_legacy_bucket(ii.item_id, ii.lot_number, ii.source_step_id) b)
 WHERE ii.is_semi_finished AND ii.wip_state_id IS NULL;

-- ── 整合の確認（違えば移行ごと落とす）────────────────────────────────────────
DO $$
DECLARE
  n int;
BEGIN
  -- 行ごとに、数量・引当・単位・場所・ロット・発生工程が変わっていない
  SELECT count(*) INTO n
    FROM "_wip_backfill_before" b
    LEFT JOIN "app"."item_inventory" ii ON ii.id = b.id
   WHERE ii.id IS NULL
      OR ii.quantity <> b.quantity
      OR ii.reserved_quantity <> b.reserved_quantity
      OR ii.unit <> b.unit
      OR ii.plant_id IS DISTINCT FROM b.plant_id
      OR ii.lot_number IS DISTINCT FROM b.lot_number
      OR ii.storage_location_id IS DISTINCT FROM b.storage_location_id
      OR ii.shelf_id IS DISTINCT FROM b.shelf_id
      OR ii.custody_bp_id IS DISTINCT FROM b.custody_bp_id
      OR ii.owner_bp_id IS DISTINCT FROM b.owner_bp_id
      OR ii.source_step_id IS DISTINCT FROM b.source_step_id
      OR ii.aimed_item_id IS DISTINCT FROM b.old_item_id
      OR ii.wip_state_id IS NULL
      OR NOT ii.is_semi_finished;
  IF n > 0 THEN
    RAISE EXCEPTION 'wip backfill: % row(s) changed beyond item / state / aimed item', n;
  END IF;

  -- 表全体の行数・数量・引当の合計が同じ
  SELECT count(*) INTO n
    FROM "_wip_backfill_count" c
   CROSS JOIN (
     SELECT count(*) AS n, coalesce(sum(quantity), 0) AS qty,
            coalesce(sum(reserved_quantity), 0) AS reserved
       FROM "app"."item_inventory") a
   WHERE (c.n, c.qty, c.reserved) IS DISTINCT FROM (a.n, a.qty, a.reserved);
  IF n > 0 THEN
    RAISE EXCEPTION 'wip backfill: item_inventory totals changed';
  END IF;

  -- 取引台帳は 1 行も触っていない（在庫行ごと・種別ごとの件数と合計が同じ）
  SELECT count(*) INTO n FROM (
    (SELECT * FROM "_wip_backfill_tx_before"
     EXCEPT
     SELECT inventory_type, inventory_id, transaction_type, count(*), sum(quantity)
       FROM "app"."inventory_transactions"
      GROUP BY inventory_type, inventory_id, transaction_type)
    UNION ALL
    (SELECT inventory_type, inventory_id, transaction_type, count(*), sum(quantity)
       FROM "app"."inventory_transactions"
      GROUP BY inventory_type, inventory_id, transaction_type
     EXCEPT
     SELECT * FROM "_wip_backfill_tx_before")
  ) d;
  IF n > 0 THEN
    RAISE EXCEPTION 'wip backfill: inventory_transactions changed';
  END IF;
END $$;

DROP TABLE "_wip_backfill_before";
DROP TABLE "_wip_backfill_tx_before";
DROP TABLE "_wip_backfill_count";

-- ── 不変条件: 半製品 ⇔ 加工状態を持つ ─────────────────────────────────────────
ALTER TABLE "app"."item_inventory"
  ADD CONSTRAINT "item_inventory_semi_finished_has_wip_state"
  CHECK ("is_semi_finished" = ("wip_state_id" IS NOT NULL));
