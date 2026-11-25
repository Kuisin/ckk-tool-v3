-- 番号設計の片付け（番号設計 PR-D）。挙動は変えない — 移行のために残していた
-- 旧い番号の列と、それを支えていた互換のトリガーを落とす。
--
-- 1. 旧い番号の列
--    - (year_month, seq) と UNIQUE … 価格試算 / 価格表 / 見積書 / 注文請書 / 出荷書 /
--      納品書 / 請求書 / 指示書 / 入出庫伝票 / 棚卸 / 会計文書（11 表）
--    - po_number（素材発注書）/ request_number（購買依頼・設計依頼）と UNIQUE
--    - 子の (…_year_month, …_seq) … 見積明細・設計依頼・注文請書（見積・差し替え元）・
--      注文請書の取消依頼・注文明細・価格表の変種（価格表・価格試算）・出荷明細・
--      納品書・納品明細・出荷の追加料金・請求明細（請求書・出荷書・納品書）・
--      税率の束・会計文書・締日処理（索引・部分 unique も一緒に落ちる。id 側の
--      同じ意味の索引は 20261126190000 で張ってある）
--    書類は id で、子は <親>_id で、人が読む番号は doc_number / doc_ref で引く。
--    振り直し前の番号は legacy_number に残っている（画面の「旧番号」・検索・
--    旧 URL の転送）— これは落とさない。
--
-- 2. 互換のトリガーと関数
--    - app.sync_doc_parent_key（子の id ↔ 旧 2 列の同期。PR-B）
--    - app.qualify_doc_ref / app.qualify_audit_record_key（番号だけで書かれた
--      多態参照・監査キーを保存時に参照へ直す。PR-B 後半）
--    - app.rewrite_legacy_doc_refs* / app.rewrite_legacy_line_refs*（旧い形で
--      書類が入ったとき、旧番号で書かれた参照・通知のリンクを繋ぎ直す。PR-C）
--    これらを必要としていた書き手は「旧い形で書く SQL のシード・スクリプト」と
--    「ローリングデプロイ中の旧コンテナ」だけだった。シードは #990（PR-D1）で新しい形
--    （id / <親>_id / legacy_number / 参照は doc_ref）で書くように直した。アプリと
--    共有端末は参照を自分で組み立てて書く（lib/doc-ref requireDocRef。
--    doc-ref-guard.test.ts が守る）。
--    参照を**引く**関数（app.to_doc_ref / app.resolve_doc_ref / app.is_doc_number /
--    app.doc_ref_table）と、振り直しの関数 app.renumber_documents は残す。
--
-- 3. 採番のトリガー app.assign_document_number から「旧い形で入ってきた番号を
--    legacy_number に受ける」分岐を外す（読む列がもう無い）。legacy_number を
--    書き手が明示したときは従来どおりそのまま残る。
--
-- 4. app.numbering_sequences から、アプリがもう払い出さない書類の鍵の行を消す
--    （書類番号は 20261126230000 以降 app.document_sequences が持つ）。
--
-- allow-destructive: **#990（番号設計 PR-D1）が dev と main の両方に載ってから merge すること。** #990 でこれらの列は Prisma の @ignore になり、生成済みの Client は SELECT も INSERT もしない。nextjs-web / nextjs-kiosk のコードからの参照も 0 件、生 SQL でも書類の表の year_month / seq / po_number / request_number は使っていない（items.year_month / seq は製品コードで対象外）。多態参照はアプリ・共有端末が lib/doc-ref で組み立てて書くので qualify_* を通る書き込みは無く、SQL シードも #990 から新しい形で書く。numbering_sequences から消す鍵は lib/numbering.ts（双子）に無い。

-- ════════════════════════════════════════════════════════════════════════
-- 1. 互換のトリガー
-- ════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS "sync_quote_id"          ON "app"."quote_items";
DROP TRIGGER IF EXISTS "sync_quote_id"          ON "app"."design_requests";
DROP TRIGGER IF EXISTS "sync_quote_id"          ON "app"."order_acceptances";
DROP TRIGGER IF EXISTS "sync_replaces_id"       ON "app"."order_acceptances";
DROP TRIGGER IF EXISTS "sync_acceptance_id"     ON "app"."order_acceptance_cancel_requests";
DROP TRIGGER IF EXISTS "sync_acceptance_id"     ON "app"."order_lines";
DROP TRIGGER IF EXISTS "sync_entry_id"          ON "app"."price_list_variants";
DROP TRIGGER IF EXISTS "sync_estimate_id"       ON "app"."price_list_variants";
DROP TRIGGER IF EXISTS "sync_delivery_order_id" ON "app"."delivery_order_items";
DROP TRIGGER IF EXISTS "sync_delivery_order_id" ON "app"."delivery_notes";
DROP TRIGGER IF EXISTS "sync_delivery_note_id"  ON "app"."delivery_note_items";
DROP TRIGGER IF EXISTS "sync_delivery_order_id" ON "app"."delivery_order_charges";
DROP TRIGGER IF EXISTS "sync_invoice_id"        ON "app"."invoice_items";
DROP TRIGGER IF EXISTS "sync_delivery_order_id" ON "app"."invoice_items";
DROP TRIGGER IF EXISTS "sync_delivery_note_id"  ON "app"."invoice_items";
DROP TRIGGER IF EXISTS "sync_invoice_id"        ON "app"."invoice_tax_summaries";
DROP TRIGGER IF EXISTS "sync_invoice_id"        ON "app"."accounting_documents";
DROP TRIGGER IF EXISTS "sync_invoice_id"        ON "app"."billing_closings";
DROP FUNCTION IF EXISTS "app"."sync_doc_parent_key"();

DROP TRIGGER IF EXISTS "qualify_doc_ref" ON "app"."approval_requests";
DROP TRIGGER IF EXISTS "qualify_doc_ref" ON "app"."document_memos";
DROP TRIGGER IF EXISTS "qualify_doc_ref" ON "app"."document_memo_revisions";
DROP TRIGGER IF EXISTS "qualify_doc_ref" ON "app"."document_attachments";
DROP TRIGGER IF EXISTS "qualify_doc_ref" ON "app"."portal_grants";
DROP TRIGGER IF EXISTS "qualify_doc_ref" ON "app"."portal_document_links";
DROP TRIGGER IF EXISTS "qualify_doc_ref" ON "app"."portal_access_logs";
DROP TRIGGER IF EXISTS "qualify_doc_ref" ON "app"."inventory_movements";
DROP TRIGGER IF EXISTS "qualify_doc_ref" ON "app"."inventory_transactions";
DROP FUNCTION IF EXISTS "app"."qualify_doc_ref"();

DROP TRIGGER IF EXISTS "qualify_audit_record_key" ON "app"."audit_logs";
DROP FUNCTION IF EXISTS "app"."qualify_audit_record_key"();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'estimates', 'price_list_entries', 'quotes', 'order_acceptances', 'delivery_orders',
    'delivery_notes', 'invoices', 'material_purchase_orders', 'purchase_requests',
    'design_requests', 'inventory_movements', 'stock_takes', 'accounting_documents'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS "rewrite_legacy_doc_refs" ON "app".%I', t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS "rewrite_legacy_line_refs" ON "app"."order_lines";
DROP FUNCTION IF EXISTS "app"."rewrite_legacy_doc_refs_after_insert"();
DROP FUNCTION IF EXISTS "app"."rewrite_legacy_line_refs_after_change"();
DROP FUNCTION IF EXISTS "app"."rewrite_legacy_doc_refs"(text, uuid);
DROP FUNCTION IF EXISTS "app"."rewrite_legacy_line_refs"(uuid);

-- ════════════════════════════════════════════════════════════════════════
-- 2. 採番のトリガー（旧い形を受ける分岐を外す）
-- ════════════════════════════════════════════════════════════════════════
-- 引数: <採番の鍵> <接頭辞> [<起票日の列。既定 created_at>]
-- 呼び出し側が何を入れてきても番号は DB が決める。legacy_number は書き手が
-- 明示したとき（シード・取込）だけ入っていて、そのまま残る。
CREATE OR REPLACE FUNCTION "app"."assign_document_number"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_key      text  := TG_ARGV[0];
  v_prefix   text  := TG_ARGV[1];
  v_date_col text  := COALESCE(NULLIF(TG_ARGV[2], ''), 'created_at');
  v_code     text;
  v_fy       int;
  v_seq      int;
BEGIN
  IF NEW."own_company_id" IS NULL THEN
    NEW."own_company_id" := "app"."default_own_company_id"();
  END IF;

  SELECT c."code" INTO v_code FROM "app"."own_companies" c WHERE c."id" = NEW."own_company_id";
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'assign_document_number: own company % not found', NEW."own_company_id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT a."fiscal_year", a."seq" INTO v_fy, v_seq
    FROM "app"."allocate_document_seq"(v_key, NEW."own_company_id",
                                       "app"."doc_record_date"(to_jsonb(NEW) ->> v_date_col)) a;

  NEW."fiscal_year" := v_fy;
  NEW."doc_seq"     := v_seq;
  NEW."doc_number"  := "app"."format_doc_number"(v_prefix, v_fy, v_seq);
  NEW."doc_ref"     := v_code || '/' || NEW."doc_number";
  RETURN NEW;
END;
$$;

-- 4 番目の引数（旧番号の列名）を渡していたトリガーを、3 引数で張り直す。
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('material_purchase_orders', 'PURCHASE', 'created_at'),
      ('purchase_requests', 'PURCHASE_REQUEST', 'created_at'),
      ('design_requests', 'DESIGN', 'created_at')
    ) AS t(tbl, key, date_col)
  LOOP
    EXECUTE format('DROP TRIGGER "assign_document_number" ON "app".%I', r.tbl);
    EXECUTE format(
      'CREATE TRIGGER "assign_document_number" BEFORE INSERT ON "app".%I FOR EACH ROW
         EXECUTE FUNCTION "app"."assign_document_number"(%L, %L, %L)',
      r.tbl, r.key, "app"."doc_number_prefix"(r.tbl), r.date_col);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- 3. 旧い番号の列（索引・UNIQUE・部分 unique は列と一緒に落ちる）
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE "app"."estimates"            DROP COLUMN "year_month", DROP COLUMN "seq";
ALTER TABLE "app"."price_list_entries"   DROP COLUMN "year_month", DROP COLUMN "seq";
ALTER TABLE "app"."quotes"               DROP COLUMN "year_month", DROP COLUMN "seq";
ALTER TABLE "app"."order_acceptances"    DROP COLUMN "year_month", DROP COLUMN "seq",
                                         DROP COLUMN "quote_year_month", DROP COLUMN "quote_seq",
                                         DROP COLUMN "replaces_year_month", DROP COLUMN "replaces_seq";
ALTER TABLE "app"."delivery_orders"      DROP COLUMN "year_month", DROP COLUMN "seq";
ALTER TABLE "app"."delivery_notes"       DROP COLUMN "year_month", DROP COLUMN "seq",
                                         DROP COLUMN "delivery_order_year_month", DROP COLUMN "delivery_order_seq";
ALTER TABLE "app"."invoices"             DROP COLUMN "year_month", DROP COLUMN "seq";
ALTER TABLE "app"."work_orders"          DROP COLUMN "year_month", DROP COLUMN "seq";
ALTER TABLE "app"."inventory_movements"  DROP COLUMN "year_month", DROP COLUMN "seq";
ALTER TABLE "app"."stock_takes"          DROP COLUMN "year_month", DROP COLUMN "seq";
ALTER TABLE "app"."accounting_documents" DROP COLUMN "year_month", DROP COLUMN "seq",
                                         DROP COLUMN "invoice_year_month", DROP COLUMN "invoice_seq";
ALTER TABLE "app"."material_purchase_orders" DROP COLUMN "po_number";
ALTER TABLE "app"."purchase_requests"    DROP COLUMN "request_number";
ALTER TABLE "app"."design_requests"      DROP COLUMN "request_number",
                                         DROP COLUMN "quote_year_month", DROP COLUMN "quote_seq";

ALTER TABLE "app"."quote_items"            DROP COLUMN "quote_year_month", DROP COLUMN "quote_seq";
ALTER TABLE "app"."order_acceptance_cancel_requests"
                                           DROP COLUMN "acceptance_year_month", DROP COLUMN "acceptance_seq";
ALTER TABLE "app"."order_lines"            DROP COLUMN "acceptance_year_month", DROP COLUMN "acceptance_seq";
ALTER TABLE "app"."price_list_variants"    DROP COLUMN "entry_year_month", DROP COLUMN "entry_seq",
                                           DROP COLUMN "estimate_year_month", DROP COLUMN "estimate_seq";
ALTER TABLE "app"."delivery_order_items"   DROP COLUMN "delivery_order_year_month", DROP COLUMN "delivery_order_seq";
ALTER TABLE "app"."delivery_note_items"    DROP COLUMN "delivery_note_year_month", DROP COLUMN "delivery_note_seq";
ALTER TABLE "app"."delivery_order_charges" DROP COLUMN "delivery_order_year_month", DROP COLUMN "delivery_order_seq";
ALTER TABLE "app"."invoice_items"          DROP COLUMN "invoice_year_month", DROP COLUMN "invoice_seq",
                                           DROP COLUMN "delivery_order_year_month", DROP COLUMN "delivery_order_seq",
                                           DROP COLUMN "delivery_note_year_month", DROP COLUMN "delivery_note_seq";
ALTER TABLE "app"."invoice_tax_summaries"  DROP COLUMN "invoice_year_month", DROP COLUMN "invoice_seq";
ALTER TABLE "app"."billing_closings"       DROP COLUMN "invoice_year_month", DROP COLUMN "invoice_seq";

-- ════════════════════════════════════════════════════════════════════════
-- 4. もう払い出さない書類の鍵（numbering_sequences）
-- ════════════════════════════════════════════════════════════════════════
DELETE FROM "app"."numbering_sequences"
 WHERE "key" IN ('ESTIMATE', 'PRICE_LIST', 'QUOTE', 'ORDER', 'ORDER_ACCEPT', 'SALES_ORDER',
                 'DELIVERY_ORDER', 'DELIVERY', 'INVOICE', 'PURCHASE', 'PURCHASE_REQUEST',
                 'DESIGN', 'WORK_ORDER_DOC', 'INVENTORY_MOVEMENT', 'STOCK_TAKE',
                 'ACCOUNTING_DOC');
