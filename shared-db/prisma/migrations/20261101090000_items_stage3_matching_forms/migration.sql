-- allow-destructive: CHECK を張り替えるための DROP CONSTRAINT。列も表も消さない。
--   デプロイの窓（スキーマが先・旧アプリが後）で旧アプリが起こすのは
--   `target_type = 'products'` の INSERT だけで、**学習は失敗しても保存を
--   止めない**（lib/match-aliases の try/catch）。数分のあいだ学習が 1 件
--   貯まらないだけで、書類の保存も突合も動く。読む側（findAlias('products')）は
--   0 件になり、推測へ落ちるだけ。

-- 品目統合 第 3 段 — **保存済みのデータが旧 id を指している** 2 か所を品目へ移す。
--
-- 第 2 段で 18 の参照表を付け替えたあと、旧 id 空間に残っていたのは
-- 「列ではなく値として旧 id を貯めている」ものだけだった:
--
--   1. app.match_aliases        … 学習した照合名（target_type + target_id の多態）
--   2. app.form_responses.answers … CM02 の保存済み回答（JSON の { id, label }）
--
-- どちらも **FK が無い**（多態 / JSON）ので、旧表を落としても DB は何も言わない。
-- そして products.id / materials.id / items.id は**どれも連番**なので、旧 id を
-- そのまま items.id として読むと **必ず何かに当たる** — 見つからないのではなく
-- 黙って別のレコードを指す。この migration はその状態を作らないためにある。
--
-- ## 1. match_aliases — products / materials → items
--
-- ★ **materials 行は 1 件も存在しないはず。** baseline
--   (20260824000003_baseline_tables_business) の CHECK は
--   `target_type = ANY (ARRAY['business_partners','products'])` のままで、
--   一度も広げられていない。購買取込 (PU02/PU03) が学習しようとした
--   'materials' 行は毎回この CHECK で弾かれ、`saveAliasLearnings` の
--   try/catch が握り潰していた（＝素材の学習は最初から 1 度も効いていない）。
--   それでもここで materials を扱うのは、手で流し込まれた行や CHECK を
--   外した環境があり得るため。**無いはずのものを無いと決めて書かない。**
--
-- ★ **products 行は曖昧にならない。** 販売側の突合 (lib/intake.ts) は今日まで
--   products.id しか書いていないので、読み方は 1 通り。逆に materials 行は
--   第 2 段 B のコードが `items.id` を 'materials' の名前で書こうとしていた
--   （CHECK に弾かれていたとはいえ）ので、**2 通りに読める**。両方に読めて
--   行き先が違う行は「どちらの id 空間か決められない」ので**捨てる**（下記）。
--
-- ### 決めたこと — 曖昧なら捨てる / 衝突は 1 本だけ残す
--
-- 学習した別名は**当たった時点で自動確定**する（1 表記 = 1 マスタ）。だから
-- 間違った行き先を推測で残すと「黙って別の製品で自動確定する」が起きる。
-- 逆に行を捨てると、推測（段階的突合）に落ちるだけで、人が次に直したときに
-- また学習される。**捨てる損より、間違って覚える害の方が大きい。**
--   * 対応が取れない行（マスタが消えている）        … 捨てる（元々 lib/match-aliases が無視していた）
--   * materials 行で 2 通りに読めて行き先が違う行    … 捨てる
--   * products 行と materials 行が同じ alias_key    … **1 本だけ残す**
--         （unique(target_type, alias_key) が 1 本に畳まれるため、物理的に両立しない）
--         残す基準は hit_count → updated_at → id の降順 = 実際に効いている方。
--         落ちた側は推測へ落ち、次の人の訂正で覚え直す。**型が違えば実害も無い**
--         — 突合側は引いた品目の item_type を必ず確かめるので（製品側は
--         itemType: PRODUCT、素材側は MATERIAL のプール）、相手の型の行が
--         当たっても素通りして推測へ落ちる。
-- 落とした件数は NOTICE で出す（黙って学習を捨てない）。
--
-- ## 2. form_responses.answers — lookup の source = product / material
--
-- どの項目が lookup かは**回答そのものには書いていない**。回答は
-- (form_id, version) で form_versions を指し、その schema (FormFieldDef[]) に
-- `type: "lookup", lookup: { source }` がある。サブテーブル (type: "table") の
-- columns[] にも 1 段だけ入れ子になる。その 2 か所を辿って書き換える。
--
-- ★ **引けない値は id を空にする**（label は残す）。旧 id をそのまま置いておくと
--   旧表を落とした後に別の品目として解決される。空にすれば
--   `asLookupValue` が null を返して解決を試みず、`isBlankAnswer` が空と見なす
--   ので、必須項目なら次に編集したときに目に見えて止まる。label は選んだ
--   時点のスナップショットなので、残しても嘘にはならない（読む人には
--   「何を選んだか」が残る）。

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. match_aliases
-- ─────────────────────────────────────────────────────────────────────────────

-- ① 行き先が決められない行を落とす（products / materials とも）
DO $$
DECLARE
  r          record;
  v_legacy   int;
  v_item     int;
  n_orphan   int := 0;
  n_ambiguous int := 0;
BEGIN
  FOR r IN
    SELECT id, target_type, target_id
      FROM app.match_aliases
     WHERE target_type IN ('products', 'materials')
     ORDER BY id
  LOOP
    v_legacy := NULL;
    v_item   := NULL;

    IF r.target_type = 'products' THEN
      -- 販売側は products.id しか書いていない（上のコメント）。読み方は 1 通り。
      SELECT p.item_id INTO v_legacy
        FROM app.products p WHERE p.id::text = r.target_id;
      IF v_legacy IS NULL THEN
        DELETE FROM app.match_aliases WHERE id = r.id;
        n_orphan := n_orphan + 1;
      END IF;
    ELSE
      -- 素材側は 2 通りに読める（旧 materials.id / 既に items.id）。
      SELECT m.item_id INTO v_legacy
        FROM app.materials m WHERE m.id::text = r.target_id;
      SELECT i.id INTO v_item
        FROM app.items i
       WHERE i.id::text = r.target_id AND i.item_type = 'MATERIAL';

      IF v_legacy IS NULL AND v_item IS NULL THEN
        DELETE FROM app.match_aliases WHERE id = r.id;
        n_orphan := n_orphan + 1;
      ELSIF v_legacy IS NOT NULL AND v_item IS NOT NULL
            AND v_legacy IS DISTINCT FROM v_item THEN
        DELETE FROM app.match_aliases WHERE id = r.id;
        n_ambiguous := n_ambiguous + 1;
      END IF;
    END IF;
  END LOOP;

  IF n_orphan > 0 THEN
    RAISE NOTICE 'stage3/match_aliases: 参照先が無い学習を % 件捨てた（マスタが消えている行 — 突合は元から無視していた）', n_orphan;
  END IF;
  IF n_ambiguous > 0 THEN
    RAISE NOTICE 'stage3/match_aliases: 旧 materials.id とも items.id とも読める学習を % 件捨てた（どちらの id 空間か決められないため。次の訂正で覚え直す）', n_ambiguous;
  END IF;
END $$;

-- ② alias_key の衝突を 1 本に畳む（製品側と素材側が同じ表記を覚えていた場合）
DO $$
DECLARE n_collision int;
BEGIN
  WITH dup AS (
    SELECT alias_key
      FROM app.match_aliases
     WHERE target_type IN ('products', 'materials')
     GROUP BY alias_key
    HAVING count(*) > 1
  ),
  ranked AS (
    SELECT a.id,
           row_number() OVER (
             PARTITION BY a.alias_key
             ORDER BY a.hit_count DESC, a.updated_at DESC, a.id DESC
           ) AS rn
      FROM app.match_aliases a
      JOIN dup USING (alias_key)
     WHERE a.target_type IN ('products', 'materials')
  )
  DELETE FROM app.match_aliases a
   USING ranked r
   WHERE a.id = r.id AND r.rn > 1;

  GET DIAGNOSTICS n_collision = ROW_COUNT;
  IF n_collision > 0 THEN
    RAISE NOTICE 'stage3/match_aliases: 製品と素材で同じ表記を覚えていた組を % 件、実績の多い方 1 本に畳んだ（1 表記 = 1 マスタ）', n_collision;
  END IF;
END $$;

-- ③ 残った行を items へ移す
--    products は必ず products.item_id 経由。materials は (a) 旧 id 経由 →
--    (b) 残り（= 既に items.id が入っていた行）の順。①で決められない行は
--    落としてあるので、この 2 本で全部が片付く。
UPDATE app.match_aliases a
   SET target_type = 'items',
       target_id   = p.item_id::text
  FROM app.products p
 WHERE a.target_type = 'products'
   AND p.id::text = a.target_id;

UPDATE app.match_aliases a
   SET target_type = 'items',
       target_id   = m.item_id::text
  FROM app.materials m
 WHERE a.target_type = 'materials'
   AND m.id::text = a.target_id
   AND m.item_id IS NOT NULL;

UPDATE app.match_aliases
   SET target_type = 'items'
 WHERE target_type = 'materials';

-- ④ CHECK を張り替える。**ここを直さないと素材の学習は今後も弾かれ続ける**
--    （そして saveAliasLearnings が握り潰すので、誰も気づかない）。
ALTER TABLE app.match_aliases DROP CONSTRAINT IF EXISTS match_aliases_target_type_check;
ALTER TABLE app.match_aliases
  ADD CONSTRAINT match_aliases_target_type_check
  CHECK (target_type = ANY (ARRAY['business_partners'::text, 'items'::text]));

COMMENT ON TABLE app.match_aliases IS
  '学習した照合名（人が手で結び付けた「印字された表記 → マスタ」）。1 表記 = 1 マスタ。target_type = business_partners | items。';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. form_responses.answers
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  resp      record;
  fld       record;
  v_ans     jsonb;
  v_val     jsonb;
  v_rows    jsonb;
  v_old     text;
  v_new     int;
  v_idx     int;
  v_changed boolean;
  n_rows    int := 0;
  n_mapped  int := 0;
  n_cleared int := 0;
BEGIN
  FOR resp IN
    SELECT fr.id, fr.answers, fv.schema
      FROM app.form_responses fr
      JOIN app.form_versions fv
        ON fv.form_id = fr.form_id AND fv.version = fr.version
     WHERE jsonb_typeof(fv.schema) = 'array'
     ORDER BY fr.id
  LOOP
    v_ans := resp.answers;
    IF jsonb_typeof(v_ans) <> 'object' THEN CONTINUE; END IF;
    v_changed := false;

    -- その版の定義から、製品・素材を指す lookup 項目だけを取り出す。
    -- col_key IS NULL = トップレベルの項目 / それ以外 = サブテーブルの列。
    FOR fld IN
      WITH f AS (
        SELECT e AS def
          FROM jsonb_array_elements(resp.schema) AS e
      )
      SELECT f.def->>'key'               AS field_key,
             NULL::text                  AS col_key,
             f.def->'lookup'->>'source'  AS source
        FROM f
       WHERE f.def->>'type' = 'lookup'
         AND f.def->'lookup'->>'source' IN ('product', 'material')
      UNION ALL
      SELECT f.def->>'key'               AS field_key,
             col->>'key'                 AS col_key,
             col->'lookup'->>'source'    AS source
        FROM f,
             LATERAL jsonb_array_elements(
               CASE WHEN jsonb_typeof(f.def->'columns') = 'array'
                    THEN f.def->'columns' ELSE '[]'::jsonb END
             ) AS col
       WHERE f.def->>'type' = 'table'
         AND col->>'type' = 'lookup'
         AND col->'lookup'->>'source' IN ('product', 'material')
    LOOP
      IF fld.field_key IS NULL THEN CONTINUE; END IF;

      IF fld.col_key IS NULL THEN
        -- トップレベルの lookup 1 件
        v_val := v_ans -> fld.field_key;
        IF jsonb_typeof(v_val) = 'object' AND jsonb_typeof(v_val->'id') = 'string' THEN
          v_old := v_val->>'id';
          IF v_old <> '' THEN
            IF fld.source = 'product' THEN
              SELECT p.item_id INTO v_new FROM app.products p WHERE p.id::text = v_old;
            ELSE
              SELECT m.item_id INTO v_new FROM app.materials m WHERE m.id::text = v_old;
            END IF;
            v_ans := jsonb_set(
              v_ans,
              ARRAY[fld.field_key, 'id'],
              to_jsonb(COALESCE(v_new::text, ''))
            );
            v_changed := true;
            IF v_new IS NULL THEN n_cleared := n_cleared + 1;
            ELSE                  n_mapped  := n_mapped  + 1;
            END IF;
          END IF;
        END IF;
      ELSE
        -- サブテーブルの列（入れ子は 1 段まで — form-schema.ts の約束）
        v_rows := v_ans -> fld.field_key;
        IF jsonb_typeof(v_rows) = 'array' THEN
          FOR v_idx IN 0 .. jsonb_array_length(v_rows) - 1 LOOP
            v_val := v_rows -> v_idx -> fld.col_key;
            IF jsonb_typeof(v_val) = 'object' AND jsonb_typeof(v_val->'id') = 'string' THEN
              v_old := v_val->>'id';
              IF v_old <> '' THEN
                IF fld.source = 'product' THEN
                  SELECT p.item_id INTO v_new FROM app.products p WHERE p.id::text = v_old;
                ELSE
                  SELECT m.item_id INTO v_new FROM app.materials m WHERE m.id::text = v_old;
                END IF;
                v_ans := jsonb_set(
                  v_ans,
                  ARRAY[fld.field_key, v_idx::text, fld.col_key, 'id'],
                  to_jsonb(COALESCE(v_new::text, ''))
                );
                -- 同じ回答の別の列も書き換えるので、毎回読み直す。
                v_rows := v_ans -> fld.field_key;
                v_changed := true;
                IF v_new IS NULL THEN n_cleared := n_cleared + 1;
                ELSE                  n_mapped  := n_mapped  + 1;
                END IF;
              END IF;
            END IF;
          END LOOP;
        END IF;
      END IF;
    END LOOP;

    IF v_changed THEN
      -- updated_at は触らない（Prisma の @updatedAt はクライアント側の印で、
      -- 移行で「誰かが直した」ことにはしない）。
      UPDATE app.form_responses SET answers = v_ans WHERE id = resp.id;
      n_rows := n_rows + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'stage3/form_responses: % 件の回答を書き換えた（品目へ付け替え % 値 / 引けずに id を空にした % 値）',
    n_rows, n_mapped, n_cleared;
  IF n_cleared > 0 THEN
    RAISE NOTICE 'stage3/form_responses: 空にした値は label（選んだ時点のスナップショット）を残してある。必須項目なら次の編集で空欄として止まる。';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 取りこぼしがあれば止める
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE n int;
BEGIN
  -- ① 旧 target_type が残っていない
  SELECT count(*) INTO n FROM app.match_aliases
   WHERE target_type NOT IN ('business_partners', 'items');
  IF n > 0 THEN
    RAISE EXCEPTION 'stage3: match_aliases に旧 target_type の行が % 件残っている', n;
  END IF;

  -- ② items 行の target_id が全部 app.items に当たる
  SELECT count(*) INTO n FROM app.match_aliases a
   WHERE a.target_type = 'items'
     AND NOT EXISTS (SELECT 1 FROM app.items i WHERE i.id::text = a.target_id);
  IF n > 0 THEN
    RAISE EXCEPTION 'stage3: match_aliases に品目へ解決できない target_id が % 件ある', n;
  END IF;

  -- ③ 回答に残っている product / material lookup の id が全部 app.items に当たる
  --    （空文字 = 引けなかった値は意図的に残すので数えない）
  WITH f AS (
    SELECT fr.id AS response_id, fr.answers, e AS def
      FROM app.form_responses fr
      JOIN app.form_versions fv
        ON fv.form_id = fr.form_id AND fv.version = fr.version,
           LATERAL jsonb_array_elements(fv.schema) AS e
     WHERE jsonb_typeof(fv.schema) = 'array'
       AND jsonb_typeof(fr.answers) = 'object'
  ),
  vals AS (
    SELECT f.answers -> (f.def->>'key') -> 'id' AS id_val,
           f.def->'lookup'->>'source'           AS source
      FROM f
     WHERE f.def->>'type' = 'lookup'
       AND f.def->'lookup'->>'source' IN ('product', 'material')
    UNION ALL
    SELECT row_val -> (col->>'key') -> 'id' AS id_val,
           col->'lookup'->>'source'         AS source
      FROM f,
           LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(f.def->'columns') = 'array'
                  THEN f.def->'columns' ELSE '[]'::jsonb END
           ) AS col,
           LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(f.answers -> (f.def->>'key')) = 'array'
                  THEN f.answers -> (f.def->>'key') ELSE '[]'::jsonb END
           ) AS row_val
     WHERE f.def->>'type' = 'table'
       AND col->>'type' = 'lookup'
       AND col->'lookup'->>'source' IN ('product', 'material')
       AND jsonb_typeof(row_val) = 'object'
  )
  SELECT count(*) INTO n
    FROM vals v
   WHERE jsonb_typeof(v.id_val) = 'string'
     AND v.id_val #>> '{}' <> ''
     AND NOT EXISTS (
       SELECT 1 FROM app.items i
        WHERE i.id::text = v.id_val #>> '{}'
          AND i.item_type = (CASE v.source WHEN 'product' THEN 'PRODUCT' ELSE 'MATERIAL' END)::app."ITEM_TYPE"
     );
  IF n > 0 THEN
    RAISE EXCEPTION 'stage3: form_responses に品目へ解決できない lookup の id が % 件残っている', n;
  END IF;
END $$;
