-- 印字番号の分割番号（#974 の続き）。
--
-- 1 つの注文明細を複数の指示書に分けて作る（work_order_order_lines の割当が
-- 受注数量より少ない）と、これまではどの指示書にも明細全体の範囲
-- （A200000-001 〜 A200000-150）が出ていて、どの指示書が何番を刻むのかが
-- 画面から決まらなかった。
--
-- 規則（利用者の決定「Split prefix number. XXX1 and XXX2.」）:
--   * 割当が明細の一部だけ（割当数量 < 受注数量）= 分割。分割ごとに基数の
--     後ろへ分割番号を付けた接頭辞を持ち、枝番は分割の中で 001 から振る:
--       A2000001-001 〜 A2000001-055 / A2000002-001 〜 A2000002-010
--   * 明細全部を 1 つの指示書で作るなら従来どおり A200000-001..（分割番号 0）。
--
-- ★ 分割番号は**割当の作成時に 1 度だけ DB が決めて凍結する**。
--   - 全量/一部の判定は作成時点の数量で行う。あとで割当数量を直して全量 ⇄ 一部が
--     入れ替わっても番号は変えない — 刷った・刻んだ番号が後から動かないことを
--     優先する（変更はトリガーが拒否）。
--   - 採番カウンタは注文明細の行（order_lines.marking_split_issued）に持つ。
--     トリガーがその行を UPDATE して +1 するので、同じ明細への並行の割当は
--     行ロックで直列になり、同じ番号を 2 つ取ることはない。
--   - 割当を消しても戻さない — 一度使った分割番号は再利用しない
--     （max+1 にしないのはこのため）。
--   - アプリは値を渡さない（渡された値は尊重する — pg_dump の復元で番号が
--     振り直されないため）。
--
-- ローリングデプロイ:
--   * 列は nullable / 既定 0 で足すだけ。旧アプリは知らないので触らない。
--   * 旧アプリの割当作成もトリガーが同じように振る。旧アプリの下書き保存は
--     割当を消して作り直すので、その間に保存された下書きは番号が進む
--     （新アプリは割当を更新で残す）。刻む前の下書きなので害は無い。
--   * 既存の割当は、明細ごとに（割当の作成時刻 → 指示書番号）の順で
--     一部だけのものに 1.. を振る。全量のものは 0。

ALTER TABLE "app"."order_lines"
  ADD COLUMN "marking_split_issued" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "app"."work_order_order_lines"
  ADD COLUMN "marking_split" INTEGER;

-- ── 既存の割当を埋める（決定的な順序） ────────────────────────────────
WITH ranked AS (
  SELECT l.work_order_id, l.order_line_id,
         row_number() OVER (
           PARTITION BY l.order_line_id
           ORDER BY l.created_at, w.work_order_number
         ) AS n
    FROM "app"."work_order_order_lines" l
    JOIN "app"."order_lines" ol ON ol.id = l.order_line_id
    JOIN "app"."work_orders" w ON w.id = l.work_order_id
   WHERE l.quantity < ol.quantity
)
UPDATE "app"."work_order_order_lines" l
   SET marking_split = r.n
  FROM ranked r
 WHERE l.work_order_id = r.work_order_id AND l.order_line_id = r.order_line_id;

UPDATE "app"."work_order_order_lines" SET marking_split = 0 WHERE marking_split IS NULL;

UPDATE "app"."order_lines" ol
   SET marking_split_issued = s.issued
  FROM (
    SELECT order_line_id, max(marking_split) AS issued
      FROM "app"."work_order_order_lines"
     GROUP BY order_line_id
  ) s
 WHERE ol.id = s.order_line_id AND s.issued > 0;

ALTER TABLE "app"."work_order_order_lines"
  ADD CONSTRAINT "work_order_order_lines_marking_split_check"
  CHECK ("marking_split" IS NULL OR "marking_split" >= 0);

-- 分割番号は明細の中で一意（0 = 分割でない、は何本あってもよい）。
CREATE UNIQUE INDEX "work_order_order_lines_marking_split_key"
  ON "app"."work_order_order_lines"("order_line_id", "marking_split")
  WHERE "marking_split" > 0;

-- ── 作成時に払い出し、以後は変えさせない ──────────────────────────────
CREATE FUNCTION "app"."work_order_order_lines_marking_split"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_line_qty integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- 一度決めた分割番号は不変（null へ戻すのも含めて拒否）。数量だけを直した
    -- 更新は通す — 全量/一部が入れ替わっても番号は作成時のまま。
    IF OLD.marking_split IS NOT NULL
       AND NEW.marking_split IS DISTINCT FROM OLD.marking_split THEN
      RAISE EXCEPTION 'work_order_order_lines.marking_split is immutable once issued (% -> %)',
        OLD.marking_split, NEW.marking_split
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.order_line_id IS DISTINCT FROM OLD.order_line_id
       AND OLD.marking_split IS NOT NULL AND OLD.marking_split > 0 THEN
      RAISE EXCEPTION 'work_order_order_lines.order_line_id cannot change once a marking split is issued'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT: 値が渡されていればそのまま（復元など）。無ければここで決める。
  IF NEW.marking_split IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT quantity INTO v_line_qty FROM "app"."order_lines" WHERE id = NEW.order_line_id;
  IF v_line_qty IS NULL OR NEW.quantity >= v_line_qty THEN
    NEW.marking_split := 0;
  ELSE
    -- 明細の行を更新してカウンタを進める = 行ロック。同じ明細への並行の
    -- 割当はここで直列になる。
    UPDATE "app"."order_lines"
       SET marking_split_issued = marking_split_issued + 1
     WHERE id = NEW.order_line_id
     RETURNING marking_split_issued INTO NEW.marking_split;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "work_order_order_lines_marking_split"
  BEFORE INSERT OR UPDATE ON "app"."work_order_order_lines"
  FOR EACH ROW EXECUTE FUNCTION "app"."work_order_order_lines_marking_split"();
