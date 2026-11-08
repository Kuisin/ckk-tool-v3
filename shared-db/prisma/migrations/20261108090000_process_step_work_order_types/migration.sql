-- 工程マスタ (MS08) に「この工程を載せてよい指示書種別」を持たせる。
--
-- ## なぜ
--
-- どの工程がどの種別の指示書で使えるかは、これまでコードがカテゴリから推測して
-- いた（`lib/workflow-core.ts` stepAllowedForType）:
--
--   在庫分 = 製品出し（在庫）と出荷工程だけ
--   製造分 = 製品出し（在庫）と再研磨工程を除く全部
--   再研磨 = 製品出し（在庫）・材料準備・加工 を除く全部
--
-- 推測なので**現場の例外を表せない**。研ぎ直しのついでに円筒を当て直す、在庫から
-- 出すだけのロットにも受入検査を通す — どちらもごく普通の運用だが、通すには
-- コードを直して配るしかなかった。どの工程をどの種別で使うかは業務の決め事なので、
-- マスタへ移す。
--
-- ## 挙動は変えない
--
-- 下の UPDATE は**いまの規則をそのまま行に写す**だけ。移行直後の可否は 1 件も
-- 変わらず、変わるのは「画面から変えられるようになる」ことだけ。
--
-- ## 設定で動かせないもの
--
-- **開始工程は種別に固定**（アプリ側 stepAllowedForType が配列より先に効く）:
-- 製品出し（在庫）は引当済み在庫を消費し、製品受入（再研磨）は顧客の預り品を
-- 計上する。どちらも台帳がその種別であることに依っているので、種別を跨がせると
-- 在庫が壊れる。行の値は下で入れるが、アプリはそれを読む前に落とす。

ALTER TABLE "app"."process_step_catalog"
  ADD COLUMN "allowed_work_order_types" "app"."WORK_ORDER_TYPE"[]
  NOT NULL DEFAULT ARRAY['MANUFACTURE']::"app"."WORK_ORDER_TYPE"[];

-- ── いまの規則を行へ写す ────────────────────────────────────────────────────
--
-- 順番が大事: 広い分類から始めて、**狭いものを後から上書きする**。
--
-- ★ 出荷工程は **コードで決まる**（workflow-core の SHIP_STEP_CODES =
--   PRE_SHIP_INSPECTION）。カテゴリではない — 出荷前検査の category は
--   INSPECTION で、SHIPPING カテゴリの行は 1 つも無い（旧 SHIPPING 工程は
--   廃止済み）。カテゴリで書くと出荷前検査が在庫分から外れ、在庫分の指示書が
--   検査工程を 1 つも載せられなくなる（実際に一度そう書いて、使い捨て DB で
--   気づいた）。

-- 材料準備・加工 → 製造分だけ（列の既定と同じだが、意図として明示する）。
UPDATE "app"."process_step_catalog"
   SET "allowed_work_order_types" = ARRAY['MANUFACTURE']::"app"."WORK_ORDER_TYPE"[]
 WHERE "category" IN ('MATERIAL_PREP', 'MACHINING');

-- コーティング・検査・検査承認 → 製造分 + 再研磨。
UPDATE "app"."process_step_catalog"
   SET "allowed_work_order_types" =
       ARRAY['MANUFACTURE','REGRIND']::"app"."WORK_ORDER_TYPE"[]
 WHERE "category" IN ('COATING', 'INSPECTION', 'APPROVAL');

-- 再研磨の研磨工程 → 再研磨だけ。
UPDATE "app"."process_step_catalog"
   SET "allowed_work_order_types" = ARRAY['REGRIND']::"app"."WORK_ORDER_TYPE"[]
 WHERE "category" = 'REGRIND';

-- 出荷工程（= 出荷前検査）→ どの種別にも載る。在庫分が載せられる唯一の
-- 普通の工程でもある。
UPDATE "app"."process_step_catalog"
   SET "allowed_work_order_types" =
       ARRAY['FROM_STOCK','MANUFACTURE','REGRIND']::"app"."WORK_ORDER_TYPE"[]
 WHERE "code" = 'PRE_SHIP_INSPECTION';

-- 開始工程は自分の種別だけ（アプリ側でも固定だが、行も揃えておく）。
UPDATE "app"."process_step_catalog"
   SET "allowed_work_order_types" = ARRAY['FROM_STOCK']::"app"."WORK_ORDER_TYPE"[]
 WHERE "code" = 'PRODUCT_ISSUE';

UPDATE "app"."process_step_catalog"
   SET "allowed_work_order_types" = ARRAY['REGRIND']::"app"."WORK_ORDER_TYPE"[]
 WHERE "code" = 'REGRIND_RECEIPT';

-- 空は「どこでも使えない工程」= 登録する意味が無い。1 つ以上を必ず選ばせる
-- （画面側の zod も同じことを言うが、API 直叩きや psql でも空にできない）。
ALTER TABLE "app"."process_step_catalog"
  ADD CONSTRAINT "process_step_catalog_work_order_types_not_empty"
  CHECK (cardinality("allowed_work_order_types") > 0);

-- 既定は残す（新しい行を作る経路が必ず値を渡すとは限らない — 渡さなければ
-- 製造分だけ = 最も狭い側に倒れる）。
