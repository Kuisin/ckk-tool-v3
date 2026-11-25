-- 書類番号を「自社法人 × 会計年度」の連番にし、DB が採番する（番号設計 PR-C）。
--
-- 決定（利用者、2026-11-25）:
--   - 形は PREFIX-FFFF-NNNNN（例 QOT-2026-00001）。連番は自社法人 × 会計年度
--     ごと。法人は番号の文字列に入らない。
--   - 番号は**作成時に DB が払い出す**（BEFORE INSERT トリガー
--     app.assign_document_number → app.allocate_document_seq）。保存が巻き戻れば
--     番号も戻る（欠番なし）。
--   - どの年度に入るかは**起票日 = 作成日時の日本時間の暦日**
--     （app.jst_date(created_at)）。出荷日・締日などの業務日付には依らない。
--   - 払い出した番号は変えない・使い回さない（キャンセルしても番号は残る）。
--   - 既存の書類は**全部振り直す**（本番の実データはまだ無い）。旧番号は
--     legacy_number に残し、検索と旧 URL の転送に使う。
--
-- 対象 15 表（鍵 / 接頭辞）:
--   estimates ESTIMATE/EST · price_list_entries PRICE_LIST/PRC · quotes QUOTE/QOT ·
--   order_acceptances ORDER/ORD（注文明細は ORD-FFFF-NNNNN-NN）·
--   delivery_orders DELIVERY_ORDER/DOR · delivery_notes DELIVERY/DRN ·
--   invoices INVOICE/INV · material_purchase_orders PURCHASE/PO ·
--   purchase_requests PURCHASE_REQUEST/PRQ · design_requests DESIGN/DSG ·
--   work_orders WORK_ORDER_DOC/WOR（ロット番号 work_order_number は通し連番のまま）·
--   inventory_movements INVENTORY_MOVEMENT/MOV · stock_takes STOCK_TAKE/STK ·
--   accounting_documents ACCOUNTING_DOC/ACC（起票日は posted_at）·
--   outsource_orders OUTSOURCE_ORDER/OUT（新設 — 外注依頼の番号）
--
-- 各表に持たせる列:
--   fiscal_year / doc_seq / doc_number … 番号の 3 つの姿。CHECK で互いに縛る。
--     （連番の列名が seq でないのは、11 表に旧い月次連番の seq が既にあるため。
--       旧列は PR-D で落とすまでそのまま残すので、新しい連番は別の列にした。）
--   doc_ref      … `<法人コード>/<書類番号>`。多態参照（承認依頼・メモ・添付・
--                  ポータル・在庫の元書類・監査キー）がこの書類を指す形そのまま。
--                  表ごとに UNIQUE なので、アプリはこの 1 列で行を引ける。
--   legacy_number … 振り直し前の番号（旧 PREFIX-YYYYMM-NNNNN）。
--
-- 旧列の扱い（落とすのは PR-D）:
--   (year_month, seq) / po_number / request_number … 値も一意制約もそのまま残し、
--     NULL 可にする（アプリが作る新しい行は NULL）。もう番号ではない。
--   子の表の (…_year_month, …_seq) … 同期トリガー（PR-B）はそのまま。新しい親は
--     (year_month, seq) が NULL なので、子の旧 2 列も NULL になる。
--
-- SQL のシード・スクリプトが旧い形（year_month + seq / po_number）で書類を入れた
-- 場合は、その旧番号を legacy_number に受けたうえで新しい番号を払い出す。旧番号で
-- 書かれた多態参照と子の行（…_year_month, …_seq）は、legacy_number から新しい
-- 書類へ繋ぎ直す（app.to_doc_ref / app.rewrite_legacy_doc_refs / 既存の
-- app.sync_doc_parent_key）。アプリはこの経路を通らない（旧列を書かない）。
--
-- ⚠️ INSERT ... ON CONFLICT DO NOTHING を対象の表に使わないこと — BEFORE INSERT
--    トリガーは衝突の判定より先に走るので、入らなかった行のぶん番号が欠ける。
--
-- 試験: shared-db/ci/sql-tests/document-numbering.sql
--
-- allow-destructive: 旧アプリとは両立しない（番号の形と行の引き方そのものが変わる）。本番の実データはまだ無く、利用者が全書類の振り直しを決めている。旧アプリが入れる行は旧番号を legacy_number に受けて新しい番号を払い出すので保存は壊れないが、(year_month, seq) で読み戻す旧コードは新しい行を引けない。/api/health の schema-readiness が新旧の入れ替わりを待つ。

-- ════════════════════════════════════════════════════════════════════════
-- 1. 列を足す・旧列を NULL 可にする（prisma migrate diff の生成そのまま）
-- ════════════════════════════════════════════════════════════════════════
-- DropIndex
DROP INDEX "app"."delivery_notes_updated_at_year_month_seq_idx";

-- DropIndex
DROP INDEX "app"."delivery_orders_updated_at_year_month_seq_idx";

-- DropIndex
DROP INDEX "app"."invoices_updated_at_year_month_seq_idx";

-- DropIndex
DROP INDEX "app"."order_acceptances_updated_at_year_month_seq_idx";

-- DropIndex
DROP INDEX "app"."quotes_updated_at_year_month_seq_idx";

-- AlterTable
ALTER TABLE "app"."accounting_documents" ADD COLUMN     "doc_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_ref" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fiscal_year" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "legacy_number" TEXT,
ALTER COLUMN "year_month" DROP NOT NULL,
ALTER COLUMN "seq" DROP NOT NULL;

-- AlterTable
ALTER TABLE "app"."delivery_notes" ADD COLUMN     "doc_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_ref" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fiscal_year" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "legacy_number" TEXT,
ALTER COLUMN "year_month" DROP NOT NULL,
ALTER COLUMN "seq" DROP NOT NULL;

-- AlterTable
ALTER TABLE "app"."delivery_orders" ADD COLUMN     "doc_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_ref" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fiscal_year" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "legacy_number" TEXT,
ALTER COLUMN "year_month" DROP NOT NULL,
ALTER COLUMN "seq" DROP NOT NULL;

-- AlterTable
ALTER TABLE "app"."design_requests" ADD COLUMN     "doc_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_ref" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fiscal_year" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "legacy_number" TEXT,
ALTER COLUMN "request_number" DROP NOT NULL;

-- AlterTable
ALTER TABLE "app"."estimates" ADD COLUMN     "doc_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_ref" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fiscal_year" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "legacy_number" TEXT,
ALTER COLUMN "year_month" DROP NOT NULL,
ALTER COLUMN "seq" DROP NOT NULL;

-- AlterTable
ALTER TABLE "app"."inventory_movements" ADD COLUMN     "doc_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_ref" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fiscal_year" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "legacy_number" TEXT,
ALTER COLUMN "year_month" DROP NOT NULL,
ALTER COLUMN "seq" DROP NOT NULL;

-- AlterTable
ALTER TABLE "app"."invoices" ADD COLUMN     "doc_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_ref" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fiscal_year" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "legacy_number" TEXT,
ALTER COLUMN "year_month" DROP NOT NULL,
ALTER COLUMN "seq" DROP NOT NULL;

-- AlterTable
ALTER TABLE "app"."material_purchase_orders" ADD COLUMN     "doc_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_ref" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fiscal_year" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "legacy_number" TEXT,
ALTER COLUMN "po_number" DROP NOT NULL;

-- AlterTable
ALTER TABLE "app"."order_acceptances" ADD COLUMN     "doc_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_ref" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fiscal_year" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "legacy_number" TEXT,
ALTER COLUMN "year_month" DROP NOT NULL,
ALTER COLUMN "seq" DROP NOT NULL;

-- AlterTable
ALTER TABLE "app"."order_lines" ADD COLUMN     "line_number" TEXT,
ADD COLUMN     "line_ref" TEXT;

-- AlterTable
ALTER TABLE "app"."price_list_entries" ADD COLUMN     "doc_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_ref" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fiscal_year" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "legacy_number" TEXT,
ALTER COLUMN "year_month" DROP NOT NULL,
ALTER COLUMN "seq" DROP NOT NULL;

-- AlterTable
ALTER TABLE "app"."purchase_requests" ADD COLUMN     "doc_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_ref" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fiscal_year" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "legacy_number" TEXT,
ALTER COLUMN "request_number" DROP NOT NULL;

-- AlterTable
ALTER TABLE "app"."quotes" ADD COLUMN     "doc_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_ref" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fiscal_year" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "legacy_number" TEXT,
ALTER COLUMN "year_month" DROP NOT NULL,
ALTER COLUMN "seq" DROP NOT NULL;

-- AlterTable
ALTER TABLE "app"."stock_takes" ADD COLUMN     "doc_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_ref" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fiscal_year" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "legacy_number" TEXT,
ALTER COLUMN "year_month" DROP NOT NULL,
ALTER COLUMN "seq" DROP NOT NULL;

-- AlterTable
ALTER TABLE "app"."work_orders" ADD COLUMN     "doc_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_ref" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doc_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fiscal_year" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "legacy_number" TEXT,
ALTER COLUMN "year_month" DROP NOT NULL,
ALTER COLUMN "seq" DROP NOT NULL;

-- CreateTable
CREATE TABLE "app"."outsource_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "own_company_id" INTEGER NOT NULL DEFAULT app.default_own_company_id(),
    "work_order_step_id" UUID,
    "fiscal_year" INTEGER NOT NULL DEFAULT 0,
    "doc_seq" INTEGER NOT NULL DEFAULT 0,
    "doc_number" TEXT NOT NULL DEFAULT '',
    "doc_ref" TEXT NOT NULL DEFAULT '',
    "legacy_number" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outsource_orders_pkey" PRIMARY KEY ("id")
);

-- ── 以下は手で足した分（Prisma スキーマからは生成されない）────────────────────

-- ════════════════════════════════════════════════════════════════════════
-- 2. 採番の関数
-- ════════════════════════════════════════════════════════════════════════

-- 表 → 接頭辞（番号を DB が払い出す表だけ。それ以外は NULL）。
-- アプリ側の双子は nextjs-web lib/doc-number.ts DOC_TABLE_PREFIX。
CREATE OR REPLACE FUNCTION "app"."doc_number_prefix"(p_table text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_table
    WHEN 'estimates' THEN 'EST'
    WHEN 'price_list_entries' THEN 'PRC'
    WHEN 'quotes' THEN 'QOT'
    WHEN 'order_acceptances' THEN 'ORD'
    WHEN 'delivery_orders' THEN 'DOR'
    WHEN 'delivery_notes' THEN 'DRN'
    WHEN 'invoices' THEN 'INV'
    WHEN 'material_purchase_orders' THEN 'PO'
    WHEN 'purchase_requests' THEN 'PRQ'
    WHEN 'design_requests' THEN 'DSG'
    WHEN 'work_orders' THEN 'WOR'
    WHEN 'inventory_movements' THEN 'MOV'
    WHEN 'stock_takes' THEN 'STK'
    WHEN 'accounting_documents' THEN 'ACC'
    WHEN 'outsource_orders' THEN 'OUT'
  END
$$;

-- 行を jsonb にしたときの時刻の文字列 → 起票日（日本時間の暦日）。
-- timestamptz は offset 付きで出るのでそのまま読める。offset の無い値
-- （timestamp 型の列）は UTC として読む — セッションの TimeZone に依らせない。
-- NULL は「いま」。
CREATE OR REPLACE FUNCTION "app"."doc_record_date"(p_text text)
RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT "app"."jst_date"(CASE
    WHEN p_text IS NULL THEN now()
    WHEN p_text ~ 'T.*(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN p_text::timestamptz
    ELSE p_text::timestamp AT TIME ZONE 'UTC'
  END)
$$;

-- BEFORE INSERT: 番号を払い出して 4 列を**必ず上書き**する。
-- 引数: <採番の鍵> <接頭辞> [<起票日の列。既定 created_at>] [<旧番号を持っていた列>]
--
-- 呼び出し側が何を入れてきても番号は DB が決める。旧い形で入ってきた値
-- （year_month + seq、または旧番号の列）は、上書きする前に legacy_number へ受ける。
CREATE OR REPLACE FUNCTION "app"."assign_document_number"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_key      text  := TG_ARGV[0];
  v_prefix   text  := TG_ARGV[1];
  v_date_col text  := COALESCE(NULLIF(TG_ARGV[2], ''), 'created_at');
  v_old_col  text  := NULLIF(TG_ARGV[3], '');
  n          jsonb := to_jsonb(NEW);
  v_old      text;
  v_code     text;
  v_fy       int;
  v_seq      int;
BEGIN
  IF NEW."own_company_id" IS NULL THEN
    NEW."own_company_id" := "app"."default_own_company_id"();
  END IF;

  -- 旧い形で入ってきた番号を受ける（シード・スクリプト・入れ替え中の旧アプリ）。
  IF NEW."legacy_number" IS NULL THEN
    IF v_old_col IS NOT NULL THEN
      v_old := n ->> v_old_col;
    ELSIF (n ->> 'year_month') IS NOT NULL AND (n ->> 'seq') IS NOT NULL THEN
      v_old := v_prefix || '-' || (n ->> 'year_month') || '-' || lpad(n ->> 'seq', 5, '0');
    END IF;
    IF v_old ~ ('^' || v_prefix || '-[0-9]{6}-[0-9]{1,6}$') THEN
      NEW."legacy_number" := v_old;
    END IF;
  END IF;

  SELECT c."code" INTO v_code FROM "app"."own_companies" c WHERE c."id" = NEW."own_company_id";
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'assign_document_number: own company % not found', NEW."own_company_id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT a."fiscal_year", a."seq" INTO v_fy, v_seq
    FROM "app"."allocate_document_seq"(v_key, NEW."own_company_id",
                                       "app"."doc_record_date"(n ->> v_date_col)) a;

  NEW."fiscal_year" := v_fy;
  NEW."doc_seq"     := v_seq;
  NEW."doc_number"  := "app"."format_doc_number"(v_prefix, v_fy, v_seq);
  NEW."doc_ref"     := v_code || '/' || NEW."doc_number";
  RETURN NEW;
END;
$$;

-- BEFORE UPDATE: 払い出した番号は変えられない。
CREATE OR REPLACE FUNCTION "app"."document_number_frozen"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."fiscal_year" IS DISTINCT FROM OLD."fiscal_year"
     OR NEW."doc_seq" IS DISTINCT FROM OLD."doc_seq"
     OR NEW."doc_number" IS DISTINCT FROM OLD."doc_number"
     OR NEW."doc_ref" IS DISTINCT FROM OLD."doc_ref" THEN
    RAISE EXCEPTION '%: document number is frozen (% cannot be changed)',
      TG_TABLE_NAME, OLD."doc_number"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 注文明細番号 = 注文請書の番号 + 枝番（ORD-FFFF-NNNNN-NN）。枝番が付くまで NULL。
CREATE OR REPLACE FUNCTION "app"."order_lines_line_number"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_number text;
  v_ref    text;
BEGIN
  IF NEW."branch" IS NULL OR NEW."acceptance_id" IS NULL THEN
    NEW."line_number" := NULL;
    NEW."line_ref"    := NULL;
    RETURN NEW;
  END IF;
  SELECT a."doc_number", a."doc_ref" INTO v_number, v_ref
    FROM "app"."order_acceptances" a WHERE a."id" = NEW."acceptance_id";
  NEW."line_number" := v_number || '-' || lpad(NEW."branch"::text, 2, '0');
  NEW."line_ref"    := v_ref    || '-' || lpad(NEW."branch"::text, 2, '0');
  RETURN NEW;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 3. 多態参照: 番号 → `<法人コード>/<番号>`（新しい番号の形に合わせて書き直す）
-- ════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS "app"."doc_ref_company_code"(text, text);

-- 番号だけ（法人なし）→ その書類の参照。旧番号でも引ける。
-- 見つからない・複数の法人にある … NULL（黙ってどれかを選ばない）。
CREATE OR REPLACE FUNCTION "app"."resolve_doc_ref"(p_type text, p_number text)
RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_table text := "app"."doc_ref_table"(p_type);
  v_col   text;
  v_refs  text[];
  m       text[];
BEGIN
  IF v_table IS NULL OR p_number IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_table = 'order_lines' THEN
    SELECT array_agg(l."line_ref") INTO v_refs
      FROM "app"."order_lines" l WHERE l."line_number" = p_number;
    IF v_refs IS NULL THEN
      -- 旧番号 ORD-YYYYMM-NNNNN-NN = 注文請書の旧番号 + 枝番
      m := regexp_match(p_number, '^(.+)-([0-9]{1,2})$');
      IF m IS NOT NULL THEN
        SELECT array_agg(l."line_ref") INTO v_refs
          FROM "app"."order_lines" l
          JOIN "app"."order_acceptances" a ON a."id" = l."acceptance_id"
         WHERE a."legacy_number" = m[1] AND l."branch" = m[2]::int
           AND l."line_ref" IS NOT NULL;
      END IF;
    END IF;
  ELSIF "app"."doc_number_prefix"(v_table) IS NOT NULL THEN
    EXECUTE format('SELECT array_agg(d."doc_ref") FROM "app".%I d WHERE d."doc_number" = $1', v_table)
      INTO v_refs USING p_number;
    IF v_refs IS NULL THEN
      EXECUTE format('SELECT array_agg(d."doc_ref") FROM "app".%I d WHERE d."legacy_number" = $1', v_table)
        INTO v_refs USING p_number;
    END IF;
  ELSE
    -- 番号を列に持つ表（フォーム回答・社内文書 — 月次の通し番号のまま）
    v_col := CASE v_table
      WHEN 'form_responses' THEN 'response_number'
      WHEN 'internal_pages' THEN 'page_number'
    END;
    IF v_col IS NULL THEN RETURN NULL; END IF;
    EXECUTE format(
      'SELECT array_agg(c."code" || ''/'' || d.%I) FROM "app".%I d
         JOIN "app"."own_companies" c ON c."id" = d."own_company_id"
        WHERE d.%I = $1', v_col, v_table, v_col)
      INTO v_refs USING p_number;
  END IF;

  IF v_refs IS NULL OR array_length(v_refs, 1) <> 1 THEN
    RETURN NULL;
  END IF;
  RETURN v_refs[1];
END;
$$;

-- 多態参照の id → 保存形。
--   番号を持つ書類の type でない / 書類番号の形でない … そのまま
--   法人コード付きで旧番号 … その法人の、その旧番号だった書類の参照へ
--   法人コード付きで新しい番号 … そのまま
--   番号だけ … 書類を引いて参照へ（旧番号でも引ける）
--   書類が見つからない … 既定の法人で付ける（書類より先に子を入れるシード、
--     既に消えた書類を指す古い行）。番号だけの値は残さない。あとから書類が
--     旧番号つきで入れば app.rewrite_legacy_doc_refs が繋ぎ直す。
CREATE OR REPLACE FUNCTION "app"."to_doc_ref"(p_type text, p_id text)
RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_table  text := "app"."doc_ref_table"(p_type);
  v_code   text;
  v_number text;
  v_ref    text;
  m        text[];
BEGIN
  IF p_id IS NULL OR v_table IS NULL THEN
    RETURN p_id;
  END IF;

  IF position('/' in p_id) > 0 THEN
    v_code   := split_part(p_id, '/', 1);
    v_number := substr(p_id, length(v_code) + 2);
    -- 旧番号（年月 6 桁）だけ繋ぎ直す。新しい形はそのまま。
    IF v_number !~ '^[A-Z]{2,4}-[0-9]{6}-' THEN
      RETURN p_id;
    END IF;
    IF v_table = 'order_lines' THEN
      m := regexp_match(v_number, '^(.+)-([0-9]{1,2})$');
      IF m IS NOT NULL THEN
        SELECT l."line_ref" INTO v_ref
          FROM "app"."order_lines" l
          JOIN "app"."order_acceptances" a ON a."id" = l."acceptance_id"
          JOIN "app"."own_companies" c ON c."id" = a."own_company_id"
         WHERE c."code" = v_code AND a."legacy_number" = m[1] AND l."branch" = m[2]::int
         LIMIT 1;
      END IF;
    ELSIF "app"."doc_number_prefix"(v_table) IS NOT NULL THEN
      EXECUTE format(
        'SELECT d."doc_ref" FROM "app".%I d
           JOIN "app"."own_companies" c ON c."id" = d."own_company_id"
          WHERE c."code" = $1 AND d."legacy_number" = $2 LIMIT 1', v_table)
        INTO v_ref USING v_code, v_number;
    END IF;
    RETURN COALESCE(v_ref, p_id);
  END IF;

  IF NOT "app"."is_doc_number"(p_id) THEN
    RETURN p_id;
  END IF;
  v_ref := "app"."resolve_doc_ref"(p_type, p_id);
  IF v_ref IS NOT NULL THEN
    RETURN v_ref;
  END IF;
  SELECT c."code" INTO v_code FROM "app"."own_companies" c
   WHERE c."id" = "app"."default_own_company_id"();
  IF v_code IS NULL THEN
    RETURN p_id;
  END IF;
  RETURN v_code || '/' || p_id;
END;
$$;

-- 旧番号で書かれた参照を、新しい番号の参照へ書き換える。
--   p_table … 書類の表。p_id … その 1 行だけ（NULL なら表の全行）。
-- 振り直し（下の 5.）と、旧番号つきで書類が入ったとき（AFTER INSERT トリガー）の
-- 両方が同じ関数を通る。旧番号を持たない行（= アプリが作った行）には何もしない。
CREATE OR REPLACE FUNCTION "app"."rewrite_legacy_doc_refs"(p_table text, p_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_types text[] := ARRAY[p_table];
  r       record;
  v_src   text;
BEGIN
  IF "app"."doc_number_prefix"(p_table) IS NULL OR p_table IN ('work_orders', 'outsource_orders') THEN
    RETURN;  -- 指示書はロット番号で、外注依頼は工程の id で指される
  END IF;
  IF p_table = 'invoices' THEN
    v_types := array_append(v_types, 'invoice_payments');
  END IF;

  -- 旧番号を持つ書類（法人コードつき）
  v_src := format(
    '(SELECT d."id", d."doc_ref", d."doc_number", d."legacy_number", c."code",
             c."code" || ''/'' || d."legacy_number" AS old_ref
        FROM "app".%I d JOIN "app"."own_companies" c ON c."id" = d."own_company_id"
       WHERE d."legacy_number" IS NOT NULL AND ($2::uuid IS NULL OR d."id" = $2)) s', p_table);

  FOR r IN SELECT * FROM (VALUES
      ('approval_requests', 'target_type', 'target_id', ''),
      ('document_memos', 'owner_type', 'owner_id', ''),
      ('document_memo_revisions', 'owner_type', 'owner_id', ''),
      ('document_attachments', 'owner_type', 'owner_id', ''),
      ('portal_grants', 'resource_type', 'resource_id', ''),
      ('portal_document_links', 'resource_type', 'resource_id', ''),
      ('portal_access_logs', 'resource_type', 'resource_id', ''),
      ('inventory_movements', 'source_type', 'source_id', ''),
      ('inventory_transactions', 'reference_type', 'reference_id', 's')
    ) AS t(tbl, type_col, id_col, suffix)
  LOOP
    EXECUTE format(
      'UPDATE "app".%I x SET %I = s."doc_ref" FROM %s
        WHERE (x.%I || %L) = ANY($1) AND x.%I = s.old_ref',
      r.tbl, r.id_col, v_src, r.type_col, r.suffix, r.id_col)
      USING v_types, p_id;
  END LOOP;

  -- 監査: キー（参照）と、人が読む番号の両方。キー無しで旧番号だけの行も拾う。
  EXECUTE format(
    'UPDATE "app"."audit_logs" x
        SET "record_key" = s."doc_ref",
            "record_id"  = CASE WHEN x."record_id" = s."legacy_number"
                                THEN s."doc_number" ELSE x."record_id" END
       FROM %s
      WHERE x."table_name" = $1[1]
        AND (x."record_key" = s.old_ref
             OR (x."record_key" IS NULL AND x."record_id" = s."legacy_number"))', v_src)
    USING v_types, p_id;

  -- 通知のリンク（/sales/quotes/QOT-202607-00001 → /sales/quotes/CKK~QOT-2026-00001）。
  -- 注文請書の番号を含む注文明細のパスも同じ置換で直る（枝番はそのまま続く）。
  EXECUTE format(
    'UPDATE "app"."notifications" x
        SET "link_path" = regexp_replace(
              x."link_path",
              ''(?:[^/?&=~]+~)?'' || s."legacy_number" || ''(?![0-9])'',
              s."code" || ''~'' || s."doc_number", ''g'')
       FROM %s
      WHERE x."link_path" LIKE ''%%'' || s."legacy_number" || ''%%''', v_src)
    USING v_types, p_id;
END;
$$;

-- 注文明細の参照（`<法人>/<注文請書の旧番号>-NN`）→ line_ref。
--   p_line_id … その 1 行だけ（NULL なら全行）。
CREATE OR REPLACE FUNCTION "app"."rewrite_legacy_line_refs"(p_line_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  r     record;
  v_src text := '(SELECT l."id", l."line_ref", l."line_number",
                         a."legacy_number" || ''-'' || lpad(l."branch"::text, 2, ''0'') AS old_number,
                         c."code" || ''/'' || a."legacy_number" || ''-'' || lpad(l."branch"::text, 2, ''0'') AS old_ref
                    FROM "app"."order_lines" l
                    JOIN "app"."order_acceptances" a ON a."id" = l."acceptance_id"
                    JOIN "app"."own_companies" c ON c."id" = a."own_company_id"
                   WHERE a."legacy_number" IS NOT NULL AND l."line_ref" IS NOT NULL
                     AND ($1::uuid IS NULL OR l."id" = $1)) s';
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('approval_requests', 'target_type', 'target_id', ''),
      ('document_memos', 'owner_type', 'owner_id', ''),
      ('document_memo_revisions', 'owner_type', 'owner_id', ''),
      ('document_attachments', 'owner_type', 'owner_id', ''),
      ('portal_grants', 'resource_type', 'resource_id', ''),
      ('portal_document_links', 'resource_type', 'resource_id', ''),
      ('portal_access_logs', 'resource_type', 'resource_id', ''),
      ('inventory_movements', 'source_type', 'source_id', ''),
      ('inventory_transactions', 'reference_type', 'reference_id', 's')
    ) AS t(tbl, type_col, id_col, suffix)
  LOOP
    EXECUTE format(
      'UPDATE "app".%I x SET %I = s."line_ref" FROM %s
        WHERE (x.%I || %L) = ''order_lines'' AND x.%I = s.old_ref',
      r.tbl, r.id_col, v_src, r.type_col, r.suffix, r.id_col)
      USING p_line_id;
  END LOOP;

  EXECUTE format(
    'UPDATE "app"."audit_logs" x
        SET "record_key" = s."line_ref",
            "record_id"  = CASE WHEN x."record_id" = s.old_number
                                THEN s."line_number" ELSE x."record_id" END
       FROM %s
      WHERE x."table_name" = ''order_lines'' AND x."record_key" = s.old_ref', v_src)
    USING p_line_id;
END;
$$;

CREATE OR REPLACE FUNCTION "app"."rewrite_legacy_doc_refs_after_insert"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM "app"."rewrite_legacy_doc_refs"(TG_TABLE_NAME, NEW."id");
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "app"."rewrite_legacy_line_refs_after_change"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "app"."order_acceptances" a
              WHERE a."id" = NEW."acceptance_id" AND a."legacy_number" IS NOT NULL) THEN
    PERFORM "app"."rewrite_legacy_line_refs"(NEW."id");
  END IF;
  RETURN NULL;
END;
$$;

-- 監査キー: 番号設計 PR-B のトリガーは 10 表だけを見ていた。番号を DB が払い出す
-- 表すべて（+ 注文明細）に広げ、キー無し・旧い形のキーで書かれた行を参照へ直す。
CREATE OR REPLACE FUNCTION "app"."qualify_audit_record_key"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ("app"."doc_number_prefix"(NEW."table_name") IS NOT NULL OR NEW."table_name" = 'order_lines')
     AND NEW."table_name" NOT IN ('work_orders', 'outsource_orders')
     AND (NEW."record_key" IS NULL OR NEW."record_key" ~ '^[0-9]{6}:[0-9]+$')
     AND "app"."is_doc_number"(NEW."record_id") THEN
    NEW."record_key" := "app"."to_doc_ref"(NEW."table_name", NEW."record_id");
    -- 旧番号で書かれていて新しい書類へ繋がったなら、人が読む番号も新しいほうへ
    IF NEW."record_id" ~ '^[A-Z]{2,4}-[0-9]{6}-'
       AND split_part(NEW."record_key", '/', 2) ~ '^[A-Z]{2,4}-[0-9]{4}-' THEN
      NEW."record_id" := split_part(NEW."record_key", '/', 2);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 表の書類に番号を払い出し直す（振り直し専用）。順は 法人 → 会計年度 →
-- 起票日時 → 旧番号 → id。**新しい書類と同じ app.allocate_document_seq を通す**
-- ので、起票日時の順に 1 件ずつ作ったときと同じ番号になる
-- （試験 document-numbering.sql が同じ関数で確かめる）。
-- 番号の変更禁止トリガー（document_number_frozen）が付いたあとは、番号が変わる
-- 行でそのトリガーが落とす — この下の 5. は、トリガーを付ける前に呼んでいる。
CREATE OR REPLACE FUNCTION "app"."renumber_documents"(
  p_table text, p_key text, p_prefix text, p_date_col text, p_company int DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  d record;
  v record;
BEGIN
  FOR d IN EXECUTE format(
    'SELECT t."id", t."own_company_id", c."code",
            "app"."doc_record_date"(to_jsonb(t) ->> %1$L) AS record_date
       FROM "app".%2$I t
       JOIN "app"."own_companies" c ON c."id" = t."own_company_id"
      WHERE ($1::int IS NULL OR t."own_company_id" = $1)
      ORDER BY t."own_company_id",
               "app"."fiscal_year_of"(c."fiscal_year_start_month",
                                      "app"."doc_record_date"(to_jsonb(t) ->> %1$L)),
               t.%1$I, t."legacy_number", t."id"', p_date_col, p_table) USING p_company
  LOOP
    SELECT a."fiscal_year", a."seq" INTO v
      FROM "app"."allocate_document_seq"(p_key, d.own_company_id, d.record_date) a;
    EXECUTE format(
      'UPDATE "app".%I SET "fiscal_year" = $1, "doc_seq" = $2, "doc_number" = $3, "doc_ref" = $4 WHERE "id" = $5',
      p_table)
      USING v.fiscal_year, v.seq, "app"."format_doc_number"(p_prefix, v.fiscal_year, v.seq),
            d.code || '/' || "app"."format_doc_number"(p_prefix, v.fiscal_year, v.seq), d.id;
  END LOOP;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 5. 既存の書類を振り直す
-- ════════════════════════════════════════════════════════════════════════
-- 突き合わせ用: 振り直し前の「多態参照の行数」と「書類に当たっている参照の数」。
CREATE TEMP TABLE "_numbering_ref_counts" AS
SELECT t.tbl, 0::bigint AS total_before, 0::bigint AS matched_before
  FROM (VALUES ('approval_requests'), ('document_memos'), ('document_memo_revisions'),
               ('document_attachments'), ('portal_grants'), ('portal_document_links'),
               ('portal_access_logs'), ('inventory_movements'), ('inventory_transactions')) AS t(tbl);

-- 参照の表 1 つについて、書類（p_use_new = false: 旧番号 / true: 新しい参照）に
-- 当たっている行数を数える。
CREATE FUNCTION pg_temp.numbering_matched(p_tbl text, p_use_new boolean)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  v_type_col text; v_id_col text; v_suffix text := '';
  v_total bigint := 0; v_n bigint; t text; v_types text;
BEGIN
  SELECT x.type_col, x.id_col, x.suffix INTO v_type_col, v_id_col, v_suffix FROM (VALUES
      ('approval_requests', 'target_type', 'target_id', ''),
      ('document_memos', 'owner_type', 'owner_id', ''),
      ('document_memo_revisions', 'owner_type', 'owner_id', ''),
      ('document_attachments', 'owner_type', 'owner_id', ''),
      ('portal_grants', 'resource_type', 'resource_id', ''),
      ('portal_document_links', 'resource_type', 'resource_id', ''),
      ('portal_access_logs', 'resource_type', 'resource_id', ''),
      ('inventory_movements', 'source_type', 'source_id', ''),
      ('inventory_transactions', 'reference_type', 'reference_id', 's')
    ) AS x(tbl, type_col, id_col, suffix) WHERE x.tbl = p_tbl;
  FOREACH t IN ARRAY ARRAY['estimates', 'price_list_entries', 'quotes', 'order_acceptances',
      'delivery_orders', 'delivery_notes', 'invoices', 'material_purchase_orders',
      'purchase_requests', 'design_requests', 'inventory_movements', 'stock_takes',
      'accounting_documents'] LOOP
    v_types := CASE WHEN t = 'invoices' THEN '''invoices'', ''invoice_payments''' ELSE quote_literal(t) END;
    EXECUTE format(
      'SELECT count(*) FROM "app".%I x
         JOIN "app".%I d ON d."legacy_number" IS NOT NULL
         JOIN "app"."own_companies" c ON c."id" = d."own_company_id"
        WHERE (x.%I || %L) IN (%s) AND x.%I = %s',
      p_tbl, t, v_type_col, v_suffix, v_types, v_id_col,
      CASE WHEN p_use_new THEN 'd."doc_ref"' ELSE 'c."code" || ''/'' || d."legacy_number"' END)
      INTO v_n;
    v_total := v_total + v_n;
  END LOOP;
  -- 注文明細
  EXECUTE format(
    'SELECT count(*) FROM "app".%I x
       JOIN "app"."order_lines" l ON l."branch" IS NOT NULL
       JOIN "app"."order_acceptances" d ON d."id" = l."acceptance_id"
       JOIN "app"."own_companies" c ON c."id" = d."own_company_id"
      WHERE (x.%I || %L) = ''order_lines'' AND d."legacy_number" IS NOT NULL AND x.%I = %s',
    p_tbl, v_type_col, v_suffix, v_id_col,
    CASE WHEN p_use_new THEN 'l."line_ref"'
         ELSE 'c."code" || ''/'' || d."legacy_number" || ''-'' || lpad(l."branch"::text, 2, ''0'')' END)
    INTO v_n;
  RETURN v_total + v_n;
END;
$$;

DO $$
DECLARE
  r record;
  d record;
  v record;
  v_n bigint;
BEGIN
  -- 5-1. 旧番号を legacy_number に写す
  FOR r IN SELECT * FROM (VALUES
      ('estimates', 'ESTIMATE', 'EST', 'created_at', NULL),
      ('price_list_entries', 'PRICE_LIST', 'PRC', 'created_at', NULL),
      ('quotes', 'QUOTE', 'QOT', 'created_at', NULL),
      ('order_acceptances', 'ORDER', 'ORD', 'created_at', NULL),
      ('delivery_orders', 'DELIVERY_ORDER', 'DOR', 'created_at', NULL),
      ('delivery_notes', 'DELIVERY', 'DRN', 'created_at', NULL),
      ('invoices', 'INVOICE', 'INV', 'created_at', NULL),
      ('material_purchase_orders', 'PURCHASE', 'PO', 'created_at', 'po_number'),
      ('purchase_requests', 'PURCHASE_REQUEST', 'PRQ', 'created_at', 'request_number'),
      ('design_requests', 'DESIGN', 'DSG', 'created_at', 'request_number'),
      ('work_orders', 'WORK_ORDER_DOC', 'WOR', 'created_at', NULL),
      ('inventory_movements', 'INVENTORY_MOVEMENT', 'MOV', 'created_at', NULL),
      ('stock_takes', 'STOCK_TAKE', 'STK', 'created_at', NULL),
      ('accounting_documents', 'ACCOUNTING_DOC', 'ACC', 'posted_at', NULL)
    ) AS t(tbl, key, prefix, date_col, old_col)
  LOOP
    IF r.old_col IS NULL THEN
      EXECUTE format(
        'UPDATE "app".%I SET "legacy_number" = %L || ''-'' || "year_month" || ''-'' || lpad("seq"::text, 5, ''0'')
          WHERE "legacy_number" IS NULL AND "year_month" IS NOT NULL', r.tbl, r.prefix);
    ELSE
      EXECUTE format('UPDATE "app".%I SET "legacy_number" = %I WHERE "legacy_number" IS NULL', r.tbl, r.old_col);
    END IF;
  END LOOP;

  -- 5-2. 参照の現状を数えておく（旧番号で書類に当たっている数）
  FOR r IN SELECT tbl FROM "_numbering_ref_counts" LOOP
    EXECUTE format('SELECT count(*) FROM "app".%I', r.tbl) INTO v_n;
    UPDATE "_numbering_ref_counts"
       SET total_before = v_n, matched_before = pg_temp.numbering_matched(r.tbl, false)
     WHERE tbl = r.tbl;
  END LOOP;

  -- 5-3. 新しい番号を払い出す（app.renumber_documents）。振り直しのあとに作る
  --      書類は、この続きの番号になる。
  FOR r IN SELECT * FROM (VALUES
      ('estimates', 'ESTIMATE', 'EST', 'created_at'),
      ('price_list_entries', 'PRICE_LIST', 'PRC', 'created_at'),
      ('quotes', 'QUOTE', 'QOT', 'created_at'),
      ('order_acceptances', 'ORDER', 'ORD', 'created_at'),
      ('delivery_orders', 'DELIVERY_ORDER', 'DOR', 'created_at'),
      ('delivery_notes', 'DELIVERY', 'DRN', 'created_at'),
      ('invoices', 'INVOICE', 'INV', 'created_at'),
      ('material_purchase_orders', 'PURCHASE', 'PO', 'created_at'),
      ('purchase_requests', 'PURCHASE_REQUEST', 'PRQ', 'created_at'),
      ('design_requests', 'DESIGN', 'DSG', 'created_at'),
      ('work_orders', 'WORK_ORDER_DOC', 'WOR', 'created_at'),
      ('inventory_movements', 'INVENTORY_MOVEMENT', 'MOV', 'created_at'),
      ('stock_takes', 'STOCK_TAKE', 'STK', 'created_at'),
      ('accounting_documents', 'ACCOUNTING_DOC', 'ACC', 'posted_at')
    ) AS t(tbl, key, prefix, date_col)
  LOOP
    PERFORM "app"."renumber_documents"(r.tbl, r.key, r.prefix, r.date_col);
  END LOOP;

  -- 5-4. 注文明細番号
  UPDATE "app"."order_lines" l
     SET "line_number" = a."doc_number" || '-' || lpad(l."branch"::text, 2, '0'),
         "line_ref"    = a."doc_ref"    || '-' || lpad(l."branch"::text, 2, '0')
    FROM "app"."order_acceptances" a
   WHERE a."id" = l."acceptance_id" AND l."branch" IS NOT NULL;

  -- 5-5. 多態参照・監査キー・通知のリンクを新しい番号へ
  FOR r IN SELECT unnest(ARRAY['estimates', 'price_list_entries', 'quotes', 'order_acceptances',
      'delivery_orders', 'delivery_notes', 'invoices', 'material_purchase_orders',
      'purchase_requests', 'design_requests', 'inventory_movements', 'stock_takes',
      'accounting_documents']) AS tbl
  LOOP
    PERFORM "app"."rewrite_legacy_doc_refs"(r.tbl);
  END LOOP;
  PERFORM "app"."rewrite_legacy_line_refs"();

  -- 5-6. 突き合わせ: 行は増減していない / 旧番号で当たっていた参照は全部、
  --      新しい参照で当たっている / 旧番号のまま残った参照は無い。
  FOR r IN SELECT * FROM "_numbering_ref_counts" LOOP
    EXECUTE format('SELECT count(*) FROM "app".%I', r.tbl) INTO v_n;
    IF v_n <> r.total_before THEN
      RAISE EXCEPTION 'renumbering: % row count changed (% -> %)', r.tbl, r.total_before, v_n;
    END IF;
    v_n := pg_temp.numbering_matched(r.tbl, true);
    IF v_n <> r.matched_before THEN
      RAISE EXCEPTION 'renumbering: % references matched % documents before, % after',
        r.tbl, r.matched_before, v_n;
    END IF;
    v_n := pg_temp.numbering_matched(r.tbl, false);
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'renumbering: % still has % references in the old number', r.tbl, v_n;
    END IF;
  END LOOP;

  -- 5-7. 振り直し漏れが無いこと
  FOR r IN SELECT unnest(ARRAY['estimates', 'price_list_entries', 'quotes', 'order_acceptances',
      'delivery_orders', 'delivery_notes', 'invoices', 'material_purchase_orders',
      'purchase_requests', 'design_requests', 'work_orders', 'inventory_movements',
      'stock_takes', 'accounting_documents']) AS tbl
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM "app".%I WHERE "doc_number" = '''' OR "doc_ref" = '''' OR "fiscal_year" = 0', r.tbl)
      INTO v_n;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'renumbering: % rows of % were not numbered', v_n, r.tbl;
    END IF;
  END LOOP;
END $$;

DROP FUNCTION pg_temp.numbering_matched(text, boolean);

-- ════════════════════════════════════════════════════════════════════════
-- 6. 一意制約・索引（prisma migrate diff の生成そのまま。振り直しのあとに張る）
-- ════════════════════════════════════════════════════════════════════════
-- CreateIndex
CREATE UNIQUE INDEX "outsource_orders_work_order_step_id_key" ON "app"."outsource_orders"("work_order_step_id");

-- CreateIndex
CREATE UNIQUE INDEX "outsource_orders_doc_ref_key" ON "app"."outsource_orders"("doc_ref");

-- CreateIndex
CREATE INDEX "outsource_orders_legacy_number_idx" ON "app"."outsource_orders"("legacy_number");

-- CreateIndex
CREATE INDEX "outsource_orders_own_company_id_idx" ON "app"."outsource_orders"("own_company_id");

-- CreateIndex
CREATE UNIQUE INDEX "outsource_orders_own_company_id_fiscal_year_doc_seq_key" ON "app"."outsource_orders"("own_company_id", "fiscal_year", "doc_seq");

-- CreateIndex
CREATE UNIQUE INDEX "outsource_orders_own_company_id_doc_number_key" ON "app"."outsource_orders"("own_company_id", "doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_documents_doc_ref_key" ON "app"."accounting_documents"("doc_ref");

-- CreateIndex
CREATE INDEX "accounting_documents_legacy_number_idx" ON "app"."accounting_documents"("legacy_number");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_documents_own_company_id_fiscal_year_doc_seq_key" ON "app"."accounting_documents"("own_company_id", "fiscal_year", "doc_seq");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_documents_own_company_id_doc_number_key" ON "app"."accounting_documents"("own_company_id", "doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_notes_doc_ref_key" ON "app"."delivery_notes"("doc_ref");

-- CreateIndex
CREATE INDEX "delivery_notes_legacy_number_idx" ON "app"."delivery_notes"("legacy_number");

-- CreateIndex
CREATE INDEX "delivery_notes_updated_at_id_idx" ON "app"."delivery_notes"("updated_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_notes_own_company_id_fiscal_year_doc_seq_key" ON "app"."delivery_notes"("own_company_id", "fiscal_year", "doc_seq");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_notes_own_company_id_doc_number_key" ON "app"."delivery_notes"("own_company_id", "doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_orders_doc_ref_key" ON "app"."delivery_orders"("doc_ref");

-- CreateIndex
CREATE INDEX "delivery_orders_legacy_number_idx" ON "app"."delivery_orders"("legacy_number");

-- CreateIndex
CREATE INDEX "delivery_orders_updated_at_id_idx" ON "app"."delivery_orders"("updated_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_orders_own_company_id_fiscal_year_doc_seq_key" ON "app"."delivery_orders"("own_company_id", "fiscal_year", "doc_seq");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_orders_own_company_id_doc_number_key" ON "app"."delivery_orders"("own_company_id", "doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "design_requests_doc_ref_key" ON "app"."design_requests"("doc_ref");

-- CreateIndex
CREATE INDEX "design_requests_legacy_number_idx" ON "app"."design_requests"("legacy_number");

-- CreateIndex
CREATE UNIQUE INDEX "design_requests_own_company_id_fiscal_year_doc_seq_key" ON "app"."design_requests"("own_company_id", "fiscal_year", "doc_seq");

-- CreateIndex
CREATE UNIQUE INDEX "design_requests_own_company_id_doc_number_key" ON "app"."design_requests"("own_company_id", "doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "estimates_doc_ref_key" ON "app"."estimates"("doc_ref");

-- CreateIndex
CREATE INDEX "estimates_legacy_number_idx" ON "app"."estimates"("legacy_number");

-- CreateIndex
CREATE UNIQUE INDEX "estimates_own_company_id_fiscal_year_doc_seq_key" ON "app"."estimates"("own_company_id", "fiscal_year", "doc_seq");

-- CreateIndex
CREATE UNIQUE INDEX "estimates_own_company_id_doc_number_key" ON "app"."estimates"("own_company_id", "doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_doc_ref_key" ON "app"."inventory_movements"("doc_ref");

-- CreateIndex
CREATE INDEX "inventory_movements_legacy_number_idx" ON "app"."inventory_movements"("legacy_number");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_own_company_id_fiscal_year_doc_seq_key" ON "app"."inventory_movements"("own_company_id", "fiscal_year", "doc_seq");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_own_company_id_doc_number_key" ON "app"."inventory_movements"("own_company_id", "doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_doc_ref_key" ON "app"."invoices"("doc_ref");

-- CreateIndex
CREATE INDEX "invoices_legacy_number_idx" ON "app"."invoices"("legacy_number");

-- CreateIndex
CREATE INDEX "invoices_updated_at_id_idx" ON "app"."invoices"("updated_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_own_company_id_fiscal_year_doc_seq_key" ON "app"."invoices"("own_company_id", "fiscal_year", "doc_seq");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_own_company_id_doc_number_key" ON "app"."invoices"("own_company_id", "doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "material_purchase_orders_doc_ref_key" ON "app"."material_purchase_orders"("doc_ref");

-- CreateIndex
CREATE INDEX "material_purchase_orders_legacy_number_idx" ON "app"."material_purchase_orders"("legacy_number");

-- CreateIndex
CREATE UNIQUE INDEX "material_purchase_orders_own_company_id_fiscal_year_doc_seq_key" ON "app"."material_purchase_orders"("own_company_id", "fiscal_year", "doc_seq");

-- CreateIndex
CREATE UNIQUE INDEX "material_purchase_orders_own_company_id_doc_number_key" ON "app"."material_purchase_orders"("own_company_id", "doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "order_acceptances_doc_ref_key" ON "app"."order_acceptances"("doc_ref");

-- CreateIndex
CREATE INDEX "order_acceptances_legacy_number_idx" ON "app"."order_acceptances"("legacy_number");

-- CreateIndex
CREATE INDEX "order_acceptances_updated_at_id_idx" ON "app"."order_acceptances"("updated_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "order_acceptances_own_company_id_fiscal_year_doc_seq_key" ON "app"."order_acceptances"("own_company_id", "fiscal_year", "doc_seq");

-- CreateIndex
CREATE UNIQUE INDEX "order_acceptances_own_company_id_doc_number_key" ON "app"."order_acceptances"("own_company_id", "doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "order_lines_line_ref_key" ON "app"."order_lines"("line_ref");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_entries_doc_ref_key" ON "app"."price_list_entries"("doc_ref");

-- CreateIndex
CREATE INDEX "price_list_entries_legacy_number_idx" ON "app"."price_list_entries"("legacy_number");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_entries_own_company_id_fiscal_year_doc_seq_key" ON "app"."price_list_entries"("own_company_id", "fiscal_year", "doc_seq");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_entries_own_company_id_doc_number_key" ON "app"."price_list_entries"("own_company_id", "doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_doc_ref_key" ON "app"."purchase_requests"("doc_ref");

-- CreateIndex
CREATE INDEX "purchase_requests_legacy_number_idx" ON "app"."purchase_requests"("legacy_number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_own_company_id_fiscal_year_doc_seq_key" ON "app"."purchase_requests"("own_company_id", "fiscal_year", "doc_seq");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_own_company_id_doc_number_key" ON "app"."purchase_requests"("own_company_id", "doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_doc_ref_key" ON "app"."quotes"("doc_ref");

-- CreateIndex
CREATE INDEX "quotes_legacy_number_idx" ON "app"."quotes"("legacy_number");

-- CreateIndex
CREATE INDEX "quotes_updated_at_id_idx" ON "app"."quotes"("updated_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_own_company_id_fiscal_year_doc_seq_key" ON "app"."quotes"("own_company_id", "fiscal_year", "doc_seq");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_own_company_id_doc_number_key" ON "app"."quotes"("own_company_id", "doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_takes_doc_ref_key" ON "app"."stock_takes"("doc_ref");

-- CreateIndex
CREATE INDEX "stock_takes_legacy_number_idx" ON "app"."stock_takes"("legacy_number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_takes_own_company_id_fiscal_year_doc_seq_key" ON "app"."stock_takes"("own_company_id", "fiscal_year", "doc_seq");

-- CreateIndex
CREATE UNIQUE INDEX "stock_takes_own_company_id_doc_number_key" ON "app"."stock_takes"("own_company_id", "doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_doc_ref_key" ON "app"."work_orders"("doc_ref");

-- CreateIndex
CREATE INDEX "work_orders_legacy_number_idx" ON "app"."work_orders"("legacy_number");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_own_company_id_fiscal_year_doc_seq_key" ON "app"."work_orders"("own_company_id", "fiscal_year", "doc_seq");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_own_company_id_doc_number_key" ON "app"."work_orders"("own_company_id", "doc_number");

-- AddForeignKey
ALTER TABLE "app"."outsource_orders" ADD CONSTRAINT "outsource_orders_work_order_step_id_fkey" FOREIGN KEY ("work_order_step_id") REFERENCES "app"."work_order_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."outsource_orders" ADD CONSTRAINT "outsource_orders_own_company_id_fkey" FOREIGN KEY ("own_company_id") REFERENCES "app"."own_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 以下は手で足した分 ────────────────────────────────────────────────────────

DROP TABLE "_numbering_ref_counts";

-- ════════════════════════════════════════════════════════════════════════
-- 7. CHECK とトリガー
-- ════════════════════════════════════════════════════════════════════════
-- 番号の 3 つの姿（年度・連番・文字列）と参照が互いに食い違わないこと。
-- format_doc_number は形を外れる値（年度 0・連番 0 など）で例外を投げるので、
-- 既定値のまま入った行もここで落ちる。
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('estimates', 'ESTIMATE', 'created_at', ''),
      ('price_list_entries', 'PRICE_LIST', 'created_at', ''),
      ('quotes', 'QUOTE', 'created_at', ''),
      ('order_acceptances', 'ORDER', 'created_at', ''),
      ('delivery_orders', 'DELIVERY_ORDER', 'created_at', ''),
      ('delivery_notes', 'DELIVERY', 'created_at', ''),
      ('invoices', 'INVOICE', 'created_at', ''),
      ('material_purchase_orders', 'PURCHASE', 'created_at', 'po_number'),
      ('purchase_requests', 'PURCHASE_REQUEST', 'created_at', 'request_number'),
      ('design_requests', 'DESIGN', 'created_at', 'request_number'),
      ('work_orders', 'WORK_ORDER_DOC', 'created_at', ''),
      ('inventory_movements', 'INVENTORY_MOVEMENT', 'created_at', ''),
      ('stock_takes', 'STOCK_TAKE', 'created_at', ''),
      ('accounting_documents', 'ACCOUNTING_DOC', 'posted_at', ''),
      ('outsource_orders', 'OUTSOURCE_ORDER', 'created_at', '')
    ) AS t(tbl, key, date_col, old_col)
  LOOP
    EXECUTE format(
      'ALTER TABLE "app".%I ADD CONSTRAINT %I CHECK ("doc_number" = "app"."format_doc_number"(%L, "fiscal_year", "doc_seq"))',
      r.tbl, r.tbl || '_doc_number_check', "app"."doc_number_prefix"(r.tbl));
    EXECUTE format(
      'ALTER TABLE "app".%I ADD CONSTRAINT %I CHECK ("doc_ref" ~ (''^[^/~[:space:]]+/'' || "doc_number" || ''$''))',
      r.tbl, r.tbl || '_doc_ref_check');
    EXECUTE format(
      'CREATE TRIGGER "assign_document_number" BEFORE INSERT ON "app".%I FOR EACH ROW
         EXECUTE FUNCTION "app"."assign_document_number"(%L, %L, %L, %L)',
      r.tbl, r.key, "app"."doc_number_prefix"(r.tbl), r.date_col, r.old_col);
    EXECUTE format(
      'CREATE TRIGGER "document_number_frozen" BEFORE UPDATE OF "fiscal_year", "doc_seq", "doc_number", "doc_ref" ON "app".%I
         FOR EACH ROW EXECUTE FUNCTION "app"."document_number_frozen"()', r.tbl);
    IF r.tbl NOT IN ('work_orders', 'outsource_orders') THEN
      EXECUTE format(
        'CREATE TRIGGER "rewrite_legacy_doc_refs" AFTER INSERT ON "app".%I FOR EACH ROW
           WHEN (NEW."legacy_number" IS NOT NULL)
           EXECUTE FUNCTION "app"."rewrite_legacy_doc_refs_after_insert"()', r.tbl);
    END IF;
  END LOOP;
END $$;

-- 外注依頼の表には発行元の変更禁止がまだ無い（ほかの表は番号設計 PR-B で付けた）。
CREATE TRIGGER "own_company_id_immutable" BEFORE UPDATE OF "own_company_id" ON "app"."outsource_orders"
  FOR EACH ROW EXECUTE FUNCTION "app"."own_company_id_immutable"();

-- 注文明細番号。sync_acceptance_id（旧列 → acceptance_id）のあとに走る必要が
-- あるので、名前順でその後ろに来る名前にしてある（BEFORE トリガーは名前順）。
CREATE TRIGGER "sync_line_number" BEFORE INSERT OR UPDATE OF "branch", "acceptance_id"
  ON "app"."order_lines" FOR EACH ROW
  EXECUTE FUNCTION "app"."order_lines_line_number"();
CREATE TRIGGER "rewrite_legacy_line_refs" AFTER INSERT OR UPDATE OF "branch", "acceptance_id"
  ON "app"."order_lines" FOR EACH ROW
  WHEN (NEW."line_ref" IS NOT NULL)
  EXECUTE FUNCTION "app"."rewrite_legacy_line_refs_after_change"();
ALTER TABLE "app"."order_lines"
  ADD CONSTRAINT "order_lines_line_number_check"
  CHECK (("branch" IS NULL AND "line_number" IS NULL AND "line_ref" IS NULL)
      OR ("branch" IS NOT NULL AND "line_number" IS NOT NULL
          AND "line_ref" ~ ('^[^/~[:space:]]+/' || "line_number" || '$')));

-- ════════════════════════════════════════════════════════════════════════
-- 8. 書類を消したときの子の掃除（参照は行が持っている）
-- ════════════════════════════════════════════════════════════════════════
-- 引数は従来どおり: <owner_type> <mode: doc | line | col> <接頭辞 or 列名>
-- 番号を DB が払い出す書類は、行の doc_ref（注文明細は line_ref）がそのまま
-- 子の指している参照。それ以外（uuid / ロット番号 / フォーム回答・社内文書）は
-- 従来どおり列の値から組み立てる。
CREATE OR REPLACE FUNCTION "app"."purge_document_children"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_owner_type text  := TG_ARGV[0];
  v_mode       text  := TG_ARGV[1];
  v_arg        text  := TG_ARGV[2];
  v_row        jsonb := to_jsonb(OLD);
  v_owner_id   text;
  v_code       text;
BEGIN
  IF v_mode = 'line' THEN
    v_owner_id := v_row ->> 'line_ref';  -- 未確定の明細は公開番号を持たない
  ELSIF "app"."doc_ref_table"(v_owner_type) IS NOT NULL AND (v_row ->> 'doc_ref') IS NOT NULL THEN
    v_owner_id := v_row ->> 'doc_ref';
  ELSIF v_mode = 'col' THEN
    v_owner_id := v_row ->> v_arg;
    -- フォーム回答・社内文書: `<法人コード>/<番号>`
    IF v_owner_id IS NOT NULL AND "app"."doc_ref_table"(v_owner_type) IS NOT NULL
       AND "app"."is_doc_number"(v_owner_id) AND v_row ? 'own_company_id' THEN
      SELECT c."code" INTO v_code FROM "app"."own_companies" c
       WHERE c."id" = (v_row ->> 'own_company_id')::int;
      IF v_code IS NOT NULL THEN
        v_owner_id := v_code || '/' || v_owner_id;
      END IF;
    END IF;
  END IF;

  IF v_owner_id IS NULL THEN
    RETURN OLD;
  END IF;

  DELETE FROM app.approval_requests
   WHERE target_type = v_owner_type AND target_id = v_owner_id;

  DELETE FROM app.document_memos
   WHERE owner_type = v_owner_type AND owner_id = v_owner_id;

  -- memo_id は ON DELETE SET NULL なので、上の削除では消えない
  DELETE FROM app.document_memo_revisions
   WHERE owner_type = v_owner_type AND owner_id = v_owner_id;

  DELETE FROM app.document_attachments
   WHERE owner_type = v_owner_type AND owner_id = v_owner_id;

  RETURN OLD;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 9. 外注依頼の番号（PU04）
-- ════════════════════════════════════════════════════════════════════════
-- 外注工程に依頼日が入った時点で 1 行作る（= 番号を払い出す）。発行元は指示書の
-- 法人。既に行があれば何もしない — ON CONFLICT DO NOTHING は使わない（BEFORE
-- INSERT の採番が衝突の判定より先に走って番号が欠ける）。
CREATE OR REPLACE FUNCTION "app"."work_order_steps_outsource_order"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."execution_location" = 'OUTSOURCE' AND NEW."outsource_requested_at" IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM "app"."outsource_orders" o
                      WHERE o."work_order_step_id" = NEW."id") THEN
    INSERT INTO "app"."outsource_orders" ("own_company_id", "work_order_step_id")
    SELECT w."own_company_id", NEW."id" FROM "app"."work_orders" w WHERE w."id" = NEW."work_order_id";
  END IF;
  RETURN NULL;
END;
$$;

-- 既存の外注依頼（依頼日が入っている外注工程）。起票日 = 依頼日。
INSERT INTO "app"."outsource_orders" ("own_company_id", "work_order_step_id", "created_at")
SELECT w."own_company_id", s."id", (s."outsource_requested_at"::timestamp AT TIME ZONE 'Asia/Tokyo')
  FROM "app"."work_order_steps" s
  JOIN "app"."work_orders" w ON w."id" = s."work_order_id"
 WHERE s."execution_location" = 'OUTSOURCE' AND s."outsource_requested_at" IS NOT NULL
 ORDER BY w."own_company_id", s."outsource_requested_at", w."work_order_number", s."sort_order", s."id";

CREATE TRIGGER "outsource_order_number" AFTER INSERT OR UPDATE OF "outsource_requested_at", "execution_location"
  ON "app"."work_order_steps" FOR EACH ROW
  EXECUTE FUNCTION "app"."work_order_steps_outsource_order"();
