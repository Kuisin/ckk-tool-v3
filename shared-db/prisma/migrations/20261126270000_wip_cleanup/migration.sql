-- 仕掛品の再設計 第 7 段（PR 7/7）の前半: アプリが旧来の印を使わなくなるための
-- DB 側の手当て。**何も落とさない**（expand / contract の contract 前段）。
--
-- この段のアプリは
--   - item_inventory.is_semi_finished を読みも書きもしない（Prisma では @ignore —
--     生成される Client に列が無い）。半製品かどうかは wip_state_id の有無で読む。
--   - app.wip_legacy_bucket を呼ばない。ブランクが決まらない指示書の半製品は、
--     アプリが自分で「未分類」の状態（app.wip_unclassified_state_id）を付けて書く。
-- ただし**列も関数もまだ残す**。デプロイとマイグレーションは並行に走り、
-- 旧アプリ（is_semi_finished を書き、旧来の形で INSERT することがある）が
-- しばらく動いている。落とすのは、この版が dev と main の両方に出たあとの
-- 次の migration（ここで落とすと、その間の旧コンテナが在庫の読み書きで 500 になる）。
--
-- 1. トリガー item_inventory_wip_legacy を「印を加工状態から埋め直す」ものにする。
--    新アプリは is_semi_finished を書かない（既定 false のまま来る）ので、
--    wip_state_id を持つ行で CHECK item_inventory_semi_finished_has_wip_state が
--    落ちる。トリガーが BEFORE で `is_semi_finished := wip_state_id IS NOT NULL`
--    に揃えれば CHECK は保たれる。旧アプリが旧来の形（is_semi_finished = true,
--    wip_state_id なし）で来たときは従来どおり app.wip_legacy_bucket で書き換える。
--    発火条件は「印と加工状態が食い違うとき」だけ — 揃っている行（旧アプリの
--    ふつうの書き込み・新アプリの非仕掛品）は素通り。
-- 2. 一意バケットの索引から is_semi_finished を抜く。is_semi_finished は
--    wip_state_id の関数（CHECK）で、wip_state_id はすでに鍵に入っているので、
--    一意性は 1 行も変わらない。Prisma の @@unique と揃えるために張り直す
--    （@ignore の列は @@unique に置けない）。

-- ── 1. 印を加工状態から埋め直す ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "app".item_inventory_wip_legacy() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  -- 旧アプリの旧来の形（半製品だが加工状態なし）→ 移行と同じ関数で行き先を決める。
  -- 印を「立てて書いてきた」ときだけ（INSERT か、false → true の UPDATE）。
  -- 加工状態を外す UPDATE では印は前の行から引き継がれているだけなので、
  -- 書き換えずに下で false へ落とす。
  IF NEW.is_semi_finished AND NEW.wip_state_id IS NULL
     AND (TG_OP = 'INSERT' OR NOT OLD.is_semi_finished) THEN
    SELECT * INTO r FROM "app".wip_legacy_bucket(NEW.item_id, NEW.lot_number, NEW.source_step_id);
    NEW.item_id := r.item_id;
    NEW.wip_state_id := r.wip_state_id;
    NEW.aimed_item_id := r.aimed_item_id;
  END IF;
  -- 印は加工状態から決まる（新アプリは印を書かない）。
  NEW.is_semi_finished := NEW.wip_state_id IS NOT NULL;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "item_inventory_wip_legacy" ON "app"."item_inventory";
CREATE TRIGGER "item_inventory_wip_legacy"
  BEFORE INSERT OR UPDATE ON "app"."item_inventory"
  FOR EACH ROW
  WHEN (NEW.is_semi_finished IS DISTINCT FROM (NEW.wip_state_id IS NOT NULL))
  EXECUTE FUNCTION "app".item_inventory_wip_legacy();

-- ── 2. 一意バケットから is_semi_finished を抜く（一意性は同じ）───────────────
DROP INDEX "app"."item_inventory_bucket_key";
CREATE UNIQUE INDEX "item_inventory_bucket_key"
  ON "app"."item_inventory" ("item_id", "plant_id", "lot_number",
                             "storage_location_id", "shelf_id", "custody_bp_id", "owner_bp_id",
                             "wip_state_id", "aimed_item_id",
                             "finished_diameter_mm", "finished_length_mm")
  NULLS NOT DISTINCT;
