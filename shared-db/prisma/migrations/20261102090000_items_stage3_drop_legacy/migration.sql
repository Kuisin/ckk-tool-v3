-- allow-destructive: 品目統合の最後の段 — 旧マスタ（products / materials）・旧在庫
--   2 表・各参照表の旧列（product_id / material_id）を落とす。**これらを読む
--   アプリはもう動いていない**: 読み手は第 2 段 B/C/D（PR #896 / #897、merge
--   済み・デプロイ済み）で全部 item 側へ移っており、この merge まで残っていたのは
--   「書き込みの橋」（lib/item-legacy-{product,material}.ts）だけで、同じ merge が
--   それも消す。NOT NULL の後付けが安全なのも同じ理由で、**item 列に NULL を
--   書き得るバージョンがもう存在しない**（列を書かないのではなく、必ず埋める）。

-- 品目統合 第 3 段 — 旧いものを落とす（_docs/items-unification-plan.md 第 3 段）。
--
-- この migration は**取り消せない**。順番に意味があるので、節の順を入れ替えない:
--
--   0. item 側を NOT NULL にする（旧列が NOT NULL だったものだけ）
--   1. audit_logs の record_id / record_key を品目 id へ読み替える
--   2. 同期トリガーと同期関数を落とす／items 側に touch_updated_at を移す
--   3. レポート用ビュー（analytics.*）を落とす — 旧表に依存していて DROP を阻む
--   4. 旧列に載っていた不変条件（UNIQUE / CHECK / 複合索引）を item 列へ移す
--   5. 旧列を落とす
--   6. 旧表を落とす
--   7. 取りこぼしがあれば止める
--
-- ## なぜ 0 が 5 より先か
--
-- 旧列が NOT NULL なら「必ず何かを指している」が保証だった。その保証は item 列へ
-- 移さないと、旧列を落とした瞬間に**誰も指していない明細**が作れるようになる。
-- NULL があれば SET NOT NULL が落ちるので、先にやれば旧列が残ったまま止まる
-- （＝ロールバックが要らない）。後に回すと、旧列を落としてから気づく。
--
-- ## なぜ 1 が 6 より先か
--
-- `audit_logs` は多態（table_name + record_id）で **FK が無い**。products.id /
-- materials.id / items.id は**どれも連番**なので、旧 id を放っておくと旧表を
-- 落とした後に「見つからない」ではなく**黙って別の品目に当たる**。読み替えには
-- products.item_id / materials.item_id が要るので、旧表を落とす前にしかできない。
--
-- ## 読み替えられない監査行（= 削除済みの製品・素材）
--
-- 製品を消すと同期トリガーが対応する品目も消していた（20261024090000）。だから
-- **DELETE の監査行は必ず読み替えられない** — 行き先が両方とも無い。これを
-- そのまま残すと別の品目を指すので、`record_id` に `legacy:` を付けて
-- **解決できない形にしつつ、旧 id は読める**ようにする（一覧で探せる／履歴は残る）。
-- 機械用の `record_key` は NULL にする — 「解決できない行は null」という
-- この列の元々の約束どおり（sys.prisma / lib/audit-record-key-core.ts）。
-- 件数は RAISE NOTICE に出す（黙って履歴の行き先を壊さない）。
--
-- ## table_name は動かさない
--
-- `'products'` / `'materials'` は**そのとき何を書いたか**という history の事実で、
-- 行き先の話ではない。直すのはポインタだけ。だから SY07 の一覧も履歴タブも
-- 従来の鍵で引ける（製品マスタは以後も tableName = 'products' で積む）。
--
-- ## inventory_transactions.inventory_type は残す
--
-- 品目から引けるので冗長だが、既存の索引と /api/v1 が使っている。畳むかどうかは
-- 別の判断（計画の第 3 段 5.）。

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. item 側を NOT NULL にする
--
-- 対象は**旧列が NOT NULL だった**列だけ。旧列が nullable だったもの
-- （estimates / order_lines / design_* / inspection_templates /
--  product_process_routes / work_orders.material_id）は nullable のまま。
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r record;
  n int;
  pairs text[][] := ARRAY[
    ['quote_items',                   'item_id'],
    ['price_list_entries',            'item_id'],
    ['customer_product_codes',        'item_id'],
    ['delivery_order_items',          'item_id'],
    ['delivery_note_items',           'item_id'],
    ['material_purchase_order_items', 'item_id'],
    ['material_receipts',             'item_id'],
    ['purchase_request_items',        'item_id'],
    ['work_orders',                   'product_item_id']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(pairs, 1) LOOP
    EXECUTE format('SELECT count(*) FROM app.%I WHERE %I IS NULL', pairs[i][1], pairs[i][2])
       INTO n;
    IF n > 0 THEN
      -- 旧列は NOT NULL だったので、ここが 0 でないなら第 2 段の埋め残しか、
      -- 品目を埋めないバージョンがまだ書いている。**落とす前に止める。**
      RAISE EXCEPTION 'stage3: app.%.% に NULL が % 件ある（旧列は NOT NULL だった — 品目を埋めずに作られた行がある）',
        pairs[i][1], pairs[i][2], n;
    END IF;
  END LOOP;
END $$;

ALTER TABLE "app"."quote_items"                   ALTER COLUMN "item_id" SET NOT NULL;
ALTER TABLE "app"."price_list_entries"            ALTER COLUMN "item_id" SET NOT NULL;
ALTER TABLE "app"."customer_product_codes"        ALTER COLUMN "item_id" SET NOT NULL;
ALTER TABLE "app"."delivery_order_items"          ALTER COLUMN "item_id" SET NOT NULL;
ALTER TABLE "app"."delivery_note_items"           ALTER COLUMN "item_id" SET NOT NULL;
ALTER TABLE "app"."material_purchase_order_items" ALTER COLUMN "item_id" SET NOT NULL;
ALTER TABLE "app"."material_receipts"             ALTER COLUMN "item_id" SET NOT NULL;
ALTER TABLE "app"."purchase_request_items"        ALTER COLUMN "item_id" SET NOT NULL;
ALTER TABLE "app"."work_orders"                   ALTER COLUMN "product_item_id" SET NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. audit_logs — record_id / record_key を品目 id へ
--
-- 1 行を 1 度だけ訪ねる（COALESCE で「引けたら品目 id / 引けなければ legacy:」）。
-- 2 文に分けると、読み替え後の値が偶然 products.id として引けてしまい**二重に
-- 読み替える**（連番同士なので必ず起きる）。
--
-- record_key は products / materials とも identity（= record_id と同じ値）が
-- 約束（lib/audit-record-key-core.ts の AUDIT_KEY_SHAPES）。だから
-- 「record_key が record_id と同じ行」だけを一緒に動かし、それ以外（旧コードが
-- 別の鍵を書いた行・まだ null の行）には触らない。
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  n_product_total int; n_product_lost int;
  n_material_total int; n_material_lost int;
BEGIN
  SELECT count(*) INTO n_product_total
    FROM app.audit_logs WHERE table_name = 'products' AND record_id IS NOT NULL;
  SELECT count(*) INTO n_product_lost
    FROM app.audit_logs a
   WHERE a.table_name = 'products' AND a.record_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM app.products p
        WHERE p.id::text = a.record_id AND p.item_id IS NOT NULL);

  SELECT count(*) INTO n_material_total
    FROM app.audit_logs WHERE table_name = 'materials' AND record_id IS NOT NULL;
  SELECT count(*) INTO n_material_lost
    FROM app.audit_logs a
   WHERE a.table_name = 'materials' AND a.record_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM app.materials m
        WHERE m.id::text = a.record_id AND m.item_id IS NOT NULL);

  UPDATE app.audit_logs a
     SET record_id = COALESCE(
           (SELECT p.item_id::text FROM app.products p
             WHERE p.id::text = a.record_id AND p.item_id IS NOT NULL),
           'legacy:' || a.record_id),
         record_key = CASE
           WHEN NOT EXISTS (SELECT 1 FROM app.products p
                             WHERE p.id::text = a.record_id AND p.item_id IS NOT NULL)
             THEN NULL
           WHEN a.record_key = a.record_id
             THEN (SELECT p.item_id::text FROM app.products p
                    WHERE p.id::text = a.record_id AND p.item_id IS NOT NULL)
           ELSE a.record_key
         END
   WHERE a.table_name = 'products' AND a.record_id IS NOT NULL;

  UPDATE app.audit_logs a
     SET record_id = COALESCE(
           (SELECT m.item_id::text FROM app.materials m
             WHERE m.id::text = a.record_id AND m.item_id IS NOT NULL),
           'legacy:' || a.record_id),
         record_key = CASE
           WHEN NOT EXISTS (SELECT 1 FROM app.materials m
                             WHERE m.id::text = a.record_id AND m.item_id IS NOT NULL)
             THEN NULL
           WHEN a.record_key = a.record_id
             THEN (SELECT m.item_id::text FROM app.materials m
                    WHERE m.id::text = a.record_id AND m.item_id IS NOT NULL)
           ELSE a.record_key
         END
   WHERE a.table_name = 'materials' AND a.record_id IS NOT NULL;

  RAISE NOTICE 'stage3/audit_logs: 製品 % 件中 % 件を品目 id へ読み替えた（残り % 件は行き先が消えている = 削除済みの製品。record_id に legacy: を付けて解決できない形にし、record_key は null にした）',
    n_product_total, n_product_total - n_product_lost, n_product_lost;
  RAISE NOTICE 'stage3/audit_logs: 素材 % 件中 % 件を品目 id へ読み替えた（残り % 件は同上）',
    n_material_total, n_material_total - n_material_lost, n_material_lost;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. 同期トリガーと同期関数
--
-- トリガーは表と一緒に消えるが、**関数は残る**（依存が無いので DROP TABLE では
-- 落ちない）。落とし損ねると、次に誰かが app.products という名前を作ったときに
-- 動き出す死んだ関数が居座る。
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS "sync_item_after_write"            ON "app"."products";
DROP TRIGGER IF EXISTS "sync_item_after_delete"           ON "app"."products";
DROP TRIGGER IF EXISTS "sync_item_after_write"            ON "app"."materials";
DROP TRIGGER IF EXISTS "sync_item_after_delete"           ON "app"."materials";
DROP TRIGGER IF EXISTS "sync_item_inventory_after_write"  ON "app"."product_inventory";
DROP TRIGGER IF EXISTS "sync_item_inventory_after_delete" ON "app"."product_inventory";
DROP TRIGGER IF EXISTS "sync_item_inventory_after_write"  ON "app"."material_inventory";
DROP TRIGGER IF EXISTS "sync_item_inventory_after_delete" ON "app"."material_inventory";

DROP FUNCTION IF EXISTS "app".sync_item_from_product();
DROP FUNCTION IF EXISTS "app".sync_item_from_material();
DROP FUNCTION IF EXISTS "app".sync_item_inventory_from_product();
DROP FUNCTION IF EXISTS "app".sync_item_inventory_from_material();

-- ─── touch_updated_at を items / item_inventory へ引き継ぐ ──────────────────
--
-- 差分同期（/api/v1 の ?updatedSince=）は updated_at の単調性に賭けている。
-- Prisma の @updatedAt は **Prisma 経由の書き込みしか**更新しないので、
-- 20261009090000 が 18 表に DB 側のトリガーを張った。その 18 表には
-- products / materials / product_inventory / material_inventory が入っていて、
-- 統合先の items / item_inventory には**まだ張られていない**（第 1 段・2A-1 が
-- 表を足しただけで、同期の担い手が旧表だったため）。旧表を落とすと、
-- /api/v1 が読む先だけ保証が無い状態になる。ここで引き継ぐ。
DROP TRIGGER IF EXISTS "touch_updated_at" ON "app"."items";
CREATE TRIGGER "touch_updated_at" BEFORE UPDATE ON "app"."items"
  FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();

DROP TRIGGER IF EXISTS "touch_updated_at" ON "app"."item_inventory";
CREATE TRIGGER "touch_updated_at" BEFORE UPDATE ON "app"."item_inventory"
  FOR EACH ROW EXECUTE FUNCTION "app".touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. レポート用ビューを落とす
--
-- analytics.* は旧 4 表に依存しているので、放っておくと DROP TABLE が止まる。
-- あれは `sql/analytics-views.sql` が**毎デプロイ**作り直す成果物で（entrypoint の
-- 順序は migrate → grants → cron → analytics-views）、Prisma の管理対象ではない。
-- 依存しているものだけ選んで落とすより全部落とすほうが安全 —
-- 将来ビューが増えてもこの移行が黙って壊れない（20261009090000 と同じやり方）。
-- 権限は grants.sql の ALTER DEFAULT PRIVILEGES が新しいビューに効く。
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v record;
BEGIN
  FOR v IN SELECT viewname FROM pg_views WHERE schemaname = 'analytics' LOOP
    EXECUTE format('DROP VIEW IF EXISTS analytics.%I CASCADE', v.viewname);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. 旧列に載っていた不変条件を item 列へ移す
--
-- ★ **DROP COLUMN はその列を使う CHECK と索引を黙って道連れにする。** 先に
--   移しておかないと、制約が消えたことに誰も気づかない（エラーも差分も出ない）。
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── UNIQUE（自然キー）───────────────────────────────────────────────────────
--
-- 価格表の識別 (顧客 × 製品) と 顧客品番の (顧客 × 製品) は、列が品目へ移っても
-- **同じ不変条件**（product_id ↔ item_id は 1:1 なので行の集合は変わらない）。
-- 計画が「別の判断」としているのは *何で価格表を識別するか* という設計の話で、
-- ここでやるのは列の付け替えだけ。鍵を落としたまま進めない。
CREATE UNIQUE INDEX "price_list_entries_customer_bp_id_item_id_key"
  ON "app"."price_list_entries"("customer_bp_id", "item_id");
CREATE UNIQUE INDEX "customer_product_codes_customer_bp_id_item_id_key"
  ON "app"."customer_product_codes"("customer_bp_id", "item_id");

-- 顧客品番の品目側 FK は **CASCADE**。旧 product_id 側がそうだったから、ではなく
-- 対応表が (品目 × 顧客) の組でしか意味を持たないから — 片側が消えたら残り物に
-- 価値が無い（lib/master-refs.ts IGNORED_REFERENCES にこの判断がある）。
-- RESTRICT のままにすると「顧客品番を 1 件登録した品目はもう消せない」になり、
-- 独立した価値の無いメタデータのために業務データの整理ができなくなる。
ALTER TABLE "app"."customer_product_codes" DROP CONSTRAINT "customer_product_codes_item_id_fkey";
ALTER TABLE "app"."customer_product_codes"
  ADD CONSTRAINT "customer_product_codes_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "app"."items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── CHECK ──────────────────────────────────────────────────────────────────

-- 確定済みの注文明細は公開番号と金額が揃っていること（baseline 000003）。
-- 「製品が決まっている」も確定の条件なので、品目側へ移す。
ALTER TABLE "app"."order_lines" DROP CONSTRAINT IF EXISTS "order_lines_confirmed_complete";
ALTER TABLE "app"."order_lines"
  ADD CONSTRAINT "order_lines_confirmed_complete"
  CHECK (
    (status = 'DRAFT'::app."ORDER_LINE_STATUS")
    OR (branch IS NOT NULL AND item_id IS NOT NULL AND unit_price IS NOT NULL
        AND amount IS NOT NULL AND confirmed_at IS NOT NULL)
  );

-- 工程リストの種別ごとの必須列（20261012090000）。準備工程リストは製品を
-- 持たない / 製造工程リストは必ず持つ。
ALTER TABLE "app"."product_process_routes" DROP CONSTRAINT IF EXISTS "product_process_routes_kind_columns";
ALTER TABLE "app"."product_process_routes"
  ADD CONSTRAINT "product_process_routes_kind_columns"
  CHECK (
    ("kind" = 'PREP' AND "item_id" IS NULL AND "customer_bp_id" IS NULL)
    OR ("kind" = 'MANUFACTURING' AND "item_id" IS NOT NULL)
  );

-- ─── 複合索引 ───────────────────────────────────────────────────────────────
--
-- 第 2 段は item 列に単独索引を足しただけなので、旧列に載っていた**複合**索引は
-- 列と一緒に消える。同じ形を item 側で作り直し、前置き部分が重なる単独索引は
-- 落とす（先頭列が同じなら複合が単独を兼ねる — 索引点検 2026-09 の規則）。
CREATE INDEX "product_process_routes_item_id_customer_bp_id_idx"
  ON "app"."product_process_routes"("item_id", "customer_bp_id");
DROP INDEX IF EXISTS "app"."product_process_routes_item_id_idx";

CREATE INDEX "design_files_item_id_customer_bp_id_is_latest_role_idx"
  ON "app"."design_files"("item_id", "customer_bp_id", "is_latest", "role");
DROP INDEX IF EXISTS "app"."design_files_item_id_idx";

CREATE INDEX "material_receipts_item_id_received_at_idx"
  ON "app"."material_receipts"("item_id", "received_at");
DROP INDEX IF EXISTS "app"."material_receipts_item_id_idx";

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. 旧列を落とす
--
-- ここまでで、この 16 列を読む者はアプリにもビューにも制約にも居ない。
-- ═══════════════════════════════════════════════════════════════════════════

-- 販売（第 2 段 C）
ALTER TABLE "app"."estimates"              DROP COLUMN "product_id";
ALTER TABLE "app"."price_list_entries"     DROP COLUMN "product_id";
ALTER TABLE "app"."quote_items"            DROP COLUMN "product_id";
ALTER TABLE "app"."order_lines"            DROP COLUMN "product_id";
ALTER TABLE "app"."delivery_order_items"   DROP COLUMN "product_id";
ALTER TABLE "app"."delivery_note_items"    DROP COLUMN "product_id";
ALTER TABLE "app"."customer_product_codes" DROP COLUMN "product_id";

-- 生産・設計（第 2 段 D）
ALTER TABLE "app"."work_orders"            DROP COLUMN "product_id";
ALTER TABLE "app"."product_process_routes" DROP COLUMN "product_id";
ALTER TABLE "app"."inspection_templates"   DROP COLUMN "product_id";
ALTER TABLE "app"."design_requests"        DROP COLUMN "product_id";
ALTER TABLE "app"."design_files"           DROP COLUMN "product_id";

-- 購買（第 2 段 B）
ALTER TABLE "app"."work_orders"                   DROP COLUMN "material_id";
ALTER TABLE "app"."material_purchase_order_items" DROP COLUMN "material_id";
ALTER TABLE "app"."material_receipts"             DROP COLUMN "material_id";
ALTER TABLE "app"."purchase_request_items"        DROP COLUMN "material_id";

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. 旧表を落とす
--
-- 在庫 2 表が先。**products / materials を指す FK を持っているのがこの 2 表だけ**に
-- なっているので、逆順にすると DROP TABLE が依存で止まる（CASCADE は使わない —
-- 何が道連れになったか読めなくなる）。
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE "app"."product_inventory";
DROP TABLE "app"."material_inventory";
DROP TABLE "app"."products";
DROP TABLE "app"."materials";

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. 取りこぼしがあれば止める
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE n int; s text;
BEGIN
  -- ① 旧表が 1 つも残っていない
  SELECT string_agg(tablename, ', ') INTO s
    FROM pg_tables
   WHERE schemaname = 'app'
     AND tablename IN ('products', 'materials', 'product_inventory', 'material_inventory');
  IF s IS NOT NULL THEN
    RAISE EXCEPTION 'stage3: 旧表が残っている: %', s;
  END IF;

  -- ② 旧列が 1 つも残っていない（product_item_id / material_item_id は対象外）
  SELECT string_agg(format('%s.%s', table_name, column_name), ', ') INTO s
    FROM information_schema.columns
   WHERE table_schema = 'app' AND column_name IN ('product_id', 'material_id');
  IF s IS NOT NULL THEN
    RAISE EXCEPTION 'stage3: 旧列が残っている: %', s;
  END IF;

  -- ③ 同期関数が残っていない
  SELECT string_agg(p.proname, ', ') INTO s
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app' AND p.proname LIKE 'sync\_item%';
  IF s IS NOT NULL THEN
    RAISE EXCEPTION 'stage3: 同期関数が残っている: %', s;
  END IF;

  -- ④ 監査の行き先が全部決まっている（品目に当たるか、legacy: で解決不能と
  --    明示されているかのどちらか。中途半端な数字が残っていない）
  SELECT count(*) INTO n
    FROM app.audit_logs a
   WHERE a.table_name IN ('products', 'materials')
     AND a.record_id IS NOT NULL
     AND a.record_id NOT LIKE 'legacy:%'
     AND NOT EXISTS (
       SELECT 1 FROM app.items i
        WHERE i.id::text = a.record_id
          AND i.item_type = (CASE a.table_name WHEN 'products' THEN 'PRODUCT'
                                               ELSE 'MATERIAL' END)::app."ITEM_TYPE");
  IF n > 0 THEN
    RAISE EXCEPTION 'stage3: audit_logs に品目へ解決できない record_id が % 件残っている', n;
  END IF;

  -- ⑤ 差分同期の updated_at トリガーが統合先に付いている
  SELECT count(*) INTO n
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'app' AND t.tgname = 'touch_updated_at'
     AND c.relname IN ('items', 'item_inventory');
  IF n <> 2 THEN
    RAISE EXCEPTION 'stage3: items / item_inventory の touch_updated_at が % 個しかない', n;
  END IF;
END $$;
