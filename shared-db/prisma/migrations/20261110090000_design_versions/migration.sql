-- allow-destructive: 引っかかるのは 2 本で、どちらも意図したもの:
--   1. approval_flows_target_type_check — 同じマイグレーションの中で
--      'design_versions' を足した版を張り直している（値の集合は広がるだけ）。
--      旧アプリはこの値を書かないので、どちらが先に着いても壊れない。
--      前例: 20261028090000_invoice_approval_and_manual_charges。
--   2. design_files.design_version_id の NOT NULL — 同じマイグレーションで全行を
--      埋めてから付ける（dev 1 行 / main 0 行、製品の無い行は 0 件を 2026-09-25 に
--      確認。残っていれば手前の DO ブロックが理由を出して止める）。旧アプリは
--      この列を知らないので、**ローリングデプロイ中の数十秒だけ、旧アプリからの
--      版の登録が失敗する**。失敗は画面にエラーとして出て、データは壊れない
--      （ファイルは巻き戻される）。expand/contract に分けると、その間に旧アプリが
--      作った列の空いた行を後から埋める手段が要り、そちらのほうが危ない。
--   それ以外の DDL はすべて表・列・型・索引・トリガーの追加。

-- 設計図の版を行にする（app.design_versions）+ 3D 原図の役割 + 仕様の移設。
--
-- これまでの「版」は design_files の行を (製品 × 受注元 × 版番号) で束ねた
-- 導出値で、版そのものの行が無かった。版に状態（下書き → (承認) → 確定）と
-- 仕様（材種・直径・全長・製品項目）を持たせるため、版を 1 行にする。
--
--   1. DESIGN_FILE_ROLE に MODEL（3D 原図）を足す。BLUEPRINT は 2D 原図として
--      読み替える（値はそのまま — 既存の行も読み手も変わらない）。
--   2. design_versions を作り、既存の design_files を束ねて**確定済みの版**として
--      起こす（既存の版はすべて使える状態だったので CONFIRMED）。
--   3. design_files.design_version_id で版を指す（NOT NULL）。
--      版は図面の表題欄の記載（title_block — 品名・材質・刃数 …）も持つ。
--      図脳 SXF (.sfc) を読むとアプリがここを埋める（既存の版は空）。
--   4. 製品マスタの仕様（items.requires_* / spec）を版へ写す:
--        - 版がある製品 … 各系列の最新版へ（それまで製品の仕様は全顧客に
--          効いていたので、どの系列から読んでも同じ値になるように）
--        - 版が無い製品 … 汎用 v1 を**ファイル無しの確定版**として作る
--      items 側の列は**このマイグレーションでは消さない**（読み手を移し終えた
--      あとの別 PR で落とす）。以後アプリは items 側を書かない。
--   5. 承認フローの対象に 'design_versions' を足す（MS0B で段を組む。段が
--      無ければ承認を通らずに確定する）。
--   6. 版を消したときに承認依頼・メモ・添付が残らないようトリガーを張る。
--
-- 旧アプリはこの表を知らない。design_files に NOT NULL 列が増えるので、旧
-- アプリが版を登録しようとすると失敗する（design_version_id が無い）— ローリング
-- デプロイ中の数十秒だけの窓で、失敗は画面にエラーとして出る（黙って壊れない）。

-- ─── 1. 役割 ────────────────────────────────────────────────────────────────
ALTER TYPE "app"."DESIGN_FILE_ROLE" ADD VALUE IF NOT EXISTS 'MODEL';

-- ─── 2. 版 ──────────────────────────────────────────────────────────────────
CREATE TYPE "app"."DESIGN_VERSION_STATUS" AS ENUM ('DRAFT', 'REQUESTED', 'CONFIRMED', 'REJECTED');

CREATE TABLE "app"."design_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" INTEGER NOT NULL,
    "customer_bp_id" UUID,
    "version" INTEGER NOT NULL,
    "status" "app"."DESIGN_VERSION_STATUS" NOT NULL DEFAULT 'DRAFT',
    "design_request_id" UUID,
    "notes" TEXT,
    "material_type_id" INTEGER,
    "diameter_mm" DECIMAL(8,3),
    "length_mm" DECIMAL(10,3),
    "spec" JSONB,
    "title_block" JSONB,
    "requested_at" TIMESTAMPTZ(6),
    "requested_by" UUID,
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmed_by" UUID,
    "history" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "design_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "design_versions_version_positive" CHECK ("version" >= 1)
);

CREATE INDEX "design_versions_design_request_id_idx" ON "app"."design_versions"("design_request_id");
CREATE INDEX "design_versions_status_idx" ON "app"."design_versions"("status");

-- 系列内の版番号は一意。**NULLS NOT DISTINCT** — 汎用系列（customer_bp_id = null）
-- 同士も同じ系列として数える。これが無いと汎用 v2 が何行でも作れる。
CREATE UNIQUE INDEX "design_versions_series_version_key"
  ON "app"."design_versions"("item_id", "customer_bp_id", "version")
  NULLS NOT DISTINCT;

-- 系列ごとに確定前の版は 1 つだけ。並行して下書きが 2 つあると、どちらが次の
-- 版なのかが読めなくなる（Prisma には現れない — 部分 index）。
CREATE UNIQUE INDEX "design_versions_open_per_series_key"
  ON "app"."design_versions"("item_id", "customer_bp_id")
  NULLS NOT DISTINCT
  WHERE "status" <> 'CONFIRMED';

ALTER TABLE "app"."design_versions" ADD CONSTRAINT "design_versions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "app"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."design_versions" ADD CONSTRAINT "design_versions_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."design_versions" ADD CONSTRAINT "design_versions_design_request_id_fkey" FOREIGN KEY ("design_request_id") REFERENCES "app"."design_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."design_versions" ADD CONSTRAINT "design_versions_material_type_id_fkey" FOREIGN KEY ("material_type_id") REFERENCES "app"."material_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."design_versions" ADD CONSTRAINT "design_versions_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."design_versions" ADD CONSTRAINT "design_versions_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."design_versions" ADD CONSTRAINT "design_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 既存の版を起こす。束ねる鍵は旧来の (製品 × 受注元 × 版番号)。
-- 依頼・作成者・日時は束の中でいちばん早い行のものを採る。
INSERT INTO "app"."design_versions"
  ("item_id", "customer_bp_id", "version", "status", "design_request_id",
   "created_by", "created_at", "confirmed_at", "confirmed_by", "updated_at", "history")
SELECT
  f.item_id,
  f.customer_bp_id,
  f.version,
  'CONFIRMED',
  (array_agg(f.design_request_id ORDER BY f.created_at) FILTER (WHERE f.design_request_id IS NOT NULL))[1],
  (array_agg(f.created_by ORDER BY f.created_at))[1],
  min(f.created_at),
  min(f.created_at),
  (array_agg(f.created_by ORDER BY f.created_at))[1],
  now(),
  jsonb_build_array(jsonb_build_object('action', 'MIGRATED', 'at', to_jsonb(now())))
FROM "app"."design_files" f
WHERE f.item_id IS NOT NULL
GROUP BY f.item_id, f.customer_bp_id, f.version;

-- ─── 3. ファイル → 版 ───────────────────────────────────────────────────────
ALTER TABLE "app"."design_files" ADD COLUMN "design_version_id" UUID;

UPDATE "app"."design_files" f
   SET "design_version_id" = v.id
  FROM "app"."design_versions" v
 WHERE v.item_id = f.item_id
   AND v.customer_bp_id IS NOT DISTINCT FROM f.customer_bp_id
   AND v.version = f.version;

-- 製品の無いファイルは系列を作れない（dev / main とも 0 行を確認済み —
-- 2026-09-25）。万一あれば、黙って NOT NULL で落ちるより理由を出して止める。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "app"."design_files" WHERE "design_version_id" IS NULL) THEN
    RAISE EXCEPTION 'design_files に製品 (item_id) の無い行があり、版に束ねられません。先に item_id を埋めるか行を整理してください';
  END IF;
END $$;

ALTER TABLE "app"."design_files" ALTER COLUMN "design_version_id" SET NOT NULL;
CREATE INDEX "design_files_design_version_id_idx" ON "app"."design_files"("design_version_id");
ALTER TABLE "app"."design_files" ADD CONSTRAINT "design_files_design_version_id_fkey" FOREIGN KEY ("design_version_id") REFERENCES "app"."design_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 4. 仕様を製品マスタから版へ ────────────────────────────────────────────
-- 「仕様がある」= 材種・直径・全長・spec のどれかが入っている。spec は
-- Prisma の JsonNull（'null'::jsonb）や空オブジェクトのことがあるので除く。
UPDATE "app"."design_versions" v
   SET "material_type_id" = i.requires_material_type_id,
       "diameter_mm" = i.requires_diameter_mm,
       "length_mm" = i.requires_length_mm,
       "spec" = CASE WHEN i.spec IS NULL OR i.spec = 'null'::jsonb OR i.spec = '{}'::jsonb THEN NULL ELSE i.spec END
  FROM "app"."items" i
 WHERE i.id = v.item_id
   AND v.version = (
     SELECT max(w.version) FROM "app"."design_versions" w
      WHERE w.item_id = v.item_id
        AND w.customer_bp_id IS NOT DISTINCT FROM v.customer_bp_id
   );

INSERT INTO "app"."design_versions"
  ("item_id", "customer_bp_id", "version", "status",
   "material_type_id", "diameter_mm", "length_mm", "spec",
   "created_at", "confirmed_at", "updated_at", "history")
SELECT
  i.id, NULL, 1, 'CONFIRMED',
  i.requires_material_type_id, i.requires_diameter_mm, i.requires_length_mm,
  CASE WHEN i.spec IS NULL OR i.spec = 'null'::jsonb OR i.spec = '{}'::jsonb THEN NULL ELSE i.spec END,
  now(), now(), now(),
  jsonb_build_array(jsonb_build_object('action', 'MIGRATED', 'at', to_jsonb(now())))
FROM "app"."items" i
WHERE i.item_type = 'PRODUCT'
  AND (
    i.requires_material_type_id IS NOT NULL
    OR i.requires_diameter_mm IS NOT NULL
    OR i.requires_length_mm IS NOT NULL
    OR (i.spec IS NOT NULL AND i.spec <> 'null'::jsonb AND i.spec <> '{}'::jsonb)
  )
  AND NOT EXISTS (SELECT 1 FROM "app"."design_versions" v WHERE v.item_id = i.id);

-- ─── 5. 承認フローの対象 ────────────────────────────────────────────────────
ALTER TABLE "app"."approval_flows" DROP CONSTRAINT IF EXISTS "approval_flows_target_type_check";
ALTER TABLE "app"."approval_flows" ADD CONSTRAINT "approval_flows_target_type_check"
  CHECK (target_type = ANY (ARRAY[
    'work_orders'::text,
    'order_acceptances'::text,
    'material_purchase_orders'::text,
    'purchase_requests'::text,
    'work_order_flow_changes'::text,
    'order_acceptance_cancel_requests'::text,
    'form_responses'::text,
    'internal_pages'::text,
    'design_requests'::text,
    'delivery_orders'::text,
    'stock_takes'::text,
    'invoices'::text,
    'invoice_payments'::text,
    'design_versions'::text
  ]));

-- ─── 6. 多態の子行の後始末 ──────────────────────────────────────────────────
-- 承認依頼は版の uuid（業務キーが無い）で指すので mode = 'col' / key = 'id'。
CREATE TRIGGER purge_children_after_delete
  AFTER DELETE ON app.design_versions
  FOR EACH ROW
  EXECUTE FUNCTION app.purge_document_children('design_versions', 'col', 'id');
