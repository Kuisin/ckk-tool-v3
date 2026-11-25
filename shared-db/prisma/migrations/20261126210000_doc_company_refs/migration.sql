-- 多態参照を「法人コード/書類番号」にする（番号設計 PR-B 後半）。
-- **番号はまだ 1 つも変えない**（振り直しは PR-C）。
--
-- なぜ要るか: PR-C で書類番号は「自社法人 × 会計年度」ごとの連番になり、法人は
-- 番号の文字列に入らない。同じ番号が 2 つの法人に存在し得るので、書類を番号の
-- 文字列で指している多態参照（FK ではない）は、番号だけでは指す先が決まらない。
-- 利用者の決定: 参照に法人コードを埋める — `CKK/QOT-2026-00001`（uuid にしない。
-- 人が読める・psql で追える参照のままにするため）。法人コードは作成後に変えられ
-- ない（own_companies_code_immutable）。
--
-- 対象の列:
--   approval_requests.target_id
--   document_memos.owner_id / document_memo_revisions.owner_id
--   document_attachments.owner_id
--   portal_grants.resource_id / portal_document_links.resource_id /
--   portal_access_logs.resource_id
--   inventory_movements.source_id / inventory_transactions.reference_id
--   audit_logs.record_key（書類番号から導いていたキー "YYYYMM:seq" だけ）
--
-- 参照へ直すのは **番号を持つ書類の type だけ**（app.doc_ref_table）。uuid・
-- ロット番号（指示書）・マスタの id で指す参照はそのまま。
--
-- アプリ側の定義元は nextjs-web lib/doc-ref-core.ts（形）と lib/doc-ref.ts
-- （type の登録簿 — 下の app.doc_ref_table と同じ集合。足すときは両方に足す）。
--
-- DB 側にも BEFORE トリガーを置き、**番号だけで書かれた値を保存時に参照へ直す**。
-- アプリは自分で参照を組み立てて書くが、(1) ローリングデプロイ中の旧コンテナ、
-- (2) SQL のシード・スクリプト・psql は番号だけで書く。そこで番号のまま残ると、
-- 新しいアプリからは見えない行になる。

-- ════════════════════════════════════════════════════════════════════════
-- 1. 参照を組み立てる関数
-- ════════════════════════════════════════════════════════════════════════

-- type → 書類の表（番号を持つ書類だけ。それ以外は NULL）。
-- invoice_payments は請求書の入金承認で、指す先は請求書（INV-…）。
CREATE OR REPLACE FUNCTION "app"."doc_ref_table"(p_type text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_type
    WHEN 'estimates' THEN 'estimates'
    WHEN 'price_list_entries' THEN 'price_list_entries'
    WHEN 'quotes' THEN 'quotes'
    WHEN 'order_acceptances' THEN 'order_acceptances'
    WHEN 'order_lines' THEN 'order_lines'
    WHEN 'delivery_orders' THEN 'delivery_orders'
    WHEN 'delivery_notes' THEN 'delivery_notes'
    WHEN 'invoices' THEN 'invoices'
    WHEN 'invoice_payments' THEN 'invoices'
    WHEN 'inventory_movements' THEN 'inventory_movements'
    WHEN 'stock_takes' THEN 'stock_takes'
    WHEN 'accounting_documents' THEN 'accounting_documents'
    WHEN 'material_purchase_orders' THEN 'material_purchase_orders'
    WHEN 'purchase_requests' THEN 'purchase_requests'
    WHEN 'design_requests' THEN 'design_requests'
    WHEN 'form_responses' THEN 'form_responses'
    WHEN 'internal_pages' THEN 'internal_pages'
  END
$$;

-- 書類番号の形か（PREFIX-YYYYMM-NNNNN、注文明細は -NN が付く。年度の 4 桁
-- （PR-C の PREFIX-FFFF-NNNNN）も通す）。同じ type でも uuid で指す参照がある
-- （在庫の order_lines は明細の uuid）ので、形で見分ける。
CREATE OR REPLACE FUNCTION "app"."is_doc_number"(p_value text)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_value ~ '^[A-Z]{2,4}-[0-9]{4,6}-[0-9]{1,6}(-[0-9]{1,2})?$'
$$;

-- その番号の書類を持つ法人のコード。見つからなければ NULL。
-- 同じ番号が複数の法人にあるとき（PR-C 以降）は NULL — 黙ってどれかを選ばない。
CREATE OR REPLACE FUNCTION "app"."doc_ref_company_code"(p_type text, p_number text)
RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_table text := "app"."doc_ref_table"(p_type);
  v_col   text;
  v_codes text[];
  m       text[];
BEGIN
  IF v_table IS NULL OR p_number IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_table = 'order_lines' THEN
    m := regexp_match(p_number, '^[A-Z]{2,4}-([0-9]{6})-([0-9]{1,6})-([0-9]{1,2})$');
    IF m IS NULL THEN RETURN NULL; END IF;
    SELECT array_agg(DISTINCT c."code") INTO v_codes
      FROM "app"."order_lines" l
      JOIN "app"."order_acceptances" d ON d."id" = l."acceptance_id"
      JOIN "app"."own_companies" c ON c."id" = d."own_company_id"
     WHERE d."year_month" = m[1] AND d."seq" = m[2]::int AND l."branch" = m[3]::int;
  ELSE
    v_col := CASE v_table
      WHEN 'material_purchase_orders' THEN 'po_number'
      WHEN 'purchase_requests' THEN 'request_number'
      WHEN 'design_requests' THEN 'request_number'
      WHEN 'form_responses' THEN 'response_number'
      WHEN 'internal_pages' THEN 'page_number'
    END;
    IF v_col IS NOT NULL THEN
      EXECUTE format(
        'SELECT array_agg(DISTINCT c."code") FROM "app".%I d
           JOIN "app"."own_companies" c ON c."id" = d."own_company_id"
          WHERE d.%I = $1', v_table, v_col)
        INTO v_codes USING p_number;
    ELSE
      m := regexp_match(p_number, '^[A-Z]{2,4}-([0-9]{6})-([0-9]{1,6})$');
      IF m IS NULL THEN RETURN NULL; END IF;
      EXECUTE format(
        'SELECT array_agg(DISTINCT c."code") FROM "app".%I d
           JOIN "app"."own_companies" c ON c."id" = d."own_company_id"
          WHERE d."year_month" = $1 AND d."seq" = $2', v_table)
        INTO v_codes USING m[1], m[2]::int;
    END IF;
  END IF;

  IF v_codes IS NULL OR array_length(v_codes, 1) <> 1 THEN
    RETURN NULL;
  END IF;
  RETURN v_codes[1];
END;
$$;

-- 多態参照の id → 保存形。
--   番号を持つ書類の type でない / 書類番号の形でない / 既に参照 … そのまま
--   番号だけ … その書類の法人で `<法人コード>/<番号>`
--   書類が見つからない … 既定の法人で付ける（書類より先に子を入れるシード、
--     既に消えた書類を指す古い行）。番号だけの値は残さない。
CREATE OR REPLACE FUNCTION "app"."to_doc_ref"(p_type text, p_id text)
RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_code text;
BEGIN
  IF p_id IS NULL OR "app"."doc_ref_table"(p_type) IS NULL
     OR position('/' in p_id) > 0 OR NOT "app"."is_doc_number"(p_id) THEN
    RETURN p_id;
  END IF;
  v_code := "app"."doc_ref_company_code"(p_type, p_id);
  IF v_code IS NULL THEN
    SELECT c."code" INTO v_code FROM "app"."own_companies" c
     WHERE c."id" = "app"."default_own_company_id"();
  END IF;
  IF v_code IS NULL THEN
    RETURN p_id;
  END IF;
  RETURN v_code || '/' || p_id;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 2. 既存の行を参照へ書き換える
-- ════════════════════════════════════════════════════════════════════════
UPDATE "app"."approval_requests"
   SET "target_id" = "app"."to_doc_ref"("target_type", "target_id")
 WHERE "app"."doc_ref_table"("target_type") IS NOT NULL
   AND "target_id" <> "app"."to_doc_ref"("target_type", "target_id");

UPDATE "app"."document_memos"
   SET "owner_id" = "app"."to_doc_ref"("owner_type", "owner_id")
 WHERE "app"."doc_ref_table"("owner_type") IS NOT NULL
   AND "owner_id" <> "app"."to_doc_ref"("owner_type", "owner_id");

UPDATE "app"."document_memo_revisions"
   SET "owner_id" = "app"."to_doc_ref"("owner_type", "owner_id")
 WHERE "app"."doc_ref_table"("owner_type") IS NOT NULL
   AND "owner_id" <> "app"."to_doc_ref"("owner_type", "owner_id");

UPDATE "app"."document_attachments"
   SET "owner_id" = "app"."to_doc_ref"("owner_type", "owner_id")
 WHERE "app"."doc_ref_table"("owner_type") IS NOT NULL
   AND "owner_id" <> "app"."to_doc_ref"("owner_type", "owner_id");

UPDATE "app"."portal_grants"
   SET "resource_id" = "app"."to_doc_ref"("resource_type", "resource_id")
 WHERE "resource_id" IS NOT NULL
   AND "app"."doc_ref_table"("resource_type") IS NOT NULL
   AND "resource_id" <> "app"."to_doc_ref"("resource_type", "resource_id");

UPDATE "app"."portal_document_links"
   SET "resource_id" = "app"."to_doc_ref"("resource_type", "resource_id")
 WHERE "app"."doc_ref_table"("resource_type") IS NOT NULL
   AND "resource_id" <> "app"."to_doc_ref"("resource_type", "resource_id");

UPDATE "app"."portal_access_logs"
   SET "resource_id" = "app"."to_doc_ref"("resource_type", "resource_id")
 WHERE "app"."doc_ref_table"("resource_type") IS NOT NULL
   AND "resource_id" <> "app"."to_doc_ref"("resource_type", "resource_id");

UPDATE "app"."inventory_movements"
   SET "source_id" = "app"."to_doc_ref"("source_type", "source_id")
 WHERE "source_id" IS NOT NULL
   AND "app"."doc_ref_table"("source_type") IS NOT NULL
   AND "source_id" <> "app"."to_doc_ref"("source_type", "source_id");

-- 在庫取引の reference_type は単数形（delivery_order / stock_take / order_line …）。
UPDATE "app"."inventory_transactions"
   SET "reference_id" = "app"."to_doc_ref"("reference_type" || 's', "reference_id")
 WHERE "reference_id" IS NOT NULL
   AND "app"."doc_ref_table"("reference_type" || 's') IS NOT NULL
   AND "reference_id" <> "app"."to_doc_ref"("reference_type" || 's', "reference_id");

-- 監査キー: 書類番号から導いていた "YYYYMM:seq" を参照へ。record_id（人が読む
-- 番号）はそのまま。番号でない record_id の行はキーを持てないので NULL に戻す
-- （読み出しは record_id で拾う）。
UPDATE "app"."audit_logs"
   SET "record_key" = CASE
         WHEN "app"."is_doc_number"("record_id")
           THEN "app"."to_doc_ref"("table_name", "record_id")
         ELSE NULL
       END
 WHERE "record_key" ~ '^[0-9]{6}:[0-9]+$'
   AND "table_name" IN ('estimates', 'price_list_entries', 'quotes', 'order_acceptances',
                        'delivery_orders', 'delivery_notes', 'invoices',
                        'inventory_movements', 'stock_takes', 'accounting_documents');

-- ════════════════════════════════════════════════════════════════════════
-- 3. 保存時に参照へ直すトリガー
-- ════════════════════════════════════════════════════════════════════════
-- 引数: <type の列> <id の列> [<type に付ける接尾辞>]
CREATE OR REPLACE FUNCTION "app"."qualify_doc_ref"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  n      jsonb := to_jsonb(NEW);
  v_type text  := (n ->> TG_ARGV[0]) || COALESCE(TG_ARGV[2], '');
  v_id   text  := n ->> TG_ARGV[1];
  v_ref  text;
BEGIN
  IF v_id IS NULL OR v_type IS NULL OR "app"."doc_ref_table"(v_type) IS NULL THEN
    RETURN NEW;
  END IF;
  v_ref := "app"."to_doc_ref"(v_type, v_id);
  IF v_ref IS DISTINCT FROM v_id THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object(TG_ARGV[1], v_ref));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "qualify_doc_ref" BEFORE INSERT OR UPDATE OF "target_type", "target_id"
  ON "app"."approval_requests" FOR EACH ROW
  EXECUTE FUNCTION "app"."qualify_doc_ref"('target_type', 'target_id');
CREATE TRIGGER "qualify_doc_ref" BEFORE INSERT OR UPDATE OF "owner_type", "owner_id"
  ON "app"."document_memos" FOR EACH ROW
  EXECUTE FUNCTION "app"."qualify_doc_ref"('owner_type', 'owner_id');
CREATE TRIGGER "qualify_doc_ref" BEFORE INSERT OR UPDATE OF "owner_type", "owner_id"
  ON "app"."document_memo_revisions" FOR EACH ROW
  EXECUTE FUNCTION "app"."qualify_doc_ref"('owner_type', 'owner_id');
CREATE TRIGGER "qualify_doc_ref" BEFORE INSERT OR UPDATE OF "owner_type", "owner_id"
  ON "app"."document_attachments" FOR EACH ROW
  EXECUTE FUNCTION "app"."qualify_doc_ref"('owner_type', 'owner_id');
CREATE TRIGGER "qualify_doc_ref" BEFORE INSERT OR UPDATE OF "resource_type", "resource_id"
  ON "app"."portal_grants" FOR EACH ROW
  EXECUTE FUNCTION "app"."qualify_doc_ref"('resource_type', 'resource_id');
CREATE TRIGGER "qualify_doc_ref" BEFORE INSERT OR UPDATE OF "resource_type", "resource_id"
  ON "app"."portal_document_links" FOR EACH ROW
  EXECUTE FUNCTION "app"."qualify_doc_ref"('resource_type', 'resource_id');
CREATE TRIGGER "qualify_doc_ref" BEFORE INSERT OR UPDATE OF "resource_type", "resource_id"
  ON "app"."portal_access_logs" FOR EACH ROW
  EXECUTE FUNCTION "app"."qualify_doc_ref"('resource_type', 'resource_id');
CREATE TRIGGER "qualify_doc_ref" BEFORE INSERT OR UPDATE OF "source_type", "source_id"
  ON "app"."inventory_movements" FOR EACH ROW
  EXECUTE FUNCTION "app"."qualify_doc_ref"('source_type', 'source_id');
CREATE TRIGGER "qualify_doc_ref" BEFORE INSERT OR UPDATE OF "reference_type", "reference_id"
  ON "app"."inventory_transactions" FOR EACH ROW
  EXECUTE FUNCTION "app"."qualify_doc_ref"('reference_type', 'reference_id', 's');

-- 監査キー: 旧コンテナは書類番号の表に "YYYYMM:seq" を書く。番号から参照を
-- 作り直す（キー無しで書かれた行も同じ）。番号以外の表のキーには触らない。
CREATE OR REPLACE FUNCTION "app"."qualify_audit_record_key"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."table_name" IN ('estimates', 'price_list_entries', 'quotes', 'order_acceptances',
                          'delivery_orders', 'delivery_notes', 'invoices',
                          'inventory_movements', 'stock_takes', 'accounting_documents')
     AND (NEW."record_key" IS NULL OR NEW."record_key" ~ '^[0-9]{6}:[0-9]+$')
     AND "app"."is_doc_number"(NEW."record_id") THEN
    NEW."record_key" := "app"."to_doc_ref"(NEW."table_name", NEW."record_id");
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "qualify_audit_record_key" BEFORE INSERT
  ON "app"."audit_logs" FOR EACH ROW
  EXECUTE FUNCTION "app"."qualify_audit_record_key"();

-- ════════════════════════════════════════════════════════════════════════
-- 4. 書類を消したときの子の掃除（参照の形に合わせて書き直す）
-- ════════════════════════════════════════════════════════════════════════
-- 引数は従来どおり: <owner_type> <mode: doc | line | col> <接頭辞 or 列名>
-- 番号を持つ書類では、消える行の法人（own_company_id。注文明細は注文請書の）
-- から `<法人コード>/<番号>` を組み立てて、その参照の子だけを消す — 同じ番号を
-- 持つ別の法人の書類の子には触らない。
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
  IF v_mode = 'doc' THEN
    v_owner_id := v_arg || '-' || (v_row ->> 'year_month')
                       || '-' || lpad(v_row ->> 'seq', 5, '0');
  ELSIF v_mode = 'line' THEN
    IF (v_row ->> 'branch') IS NULL THEN
      RETURN OLD;  -- 未確定の明細は公開番号を持たない
    END IF;
    v_owner_id := 'ORD-' || (v_row ->> 'acceptance_year_month')
                         || '-' || lpad(v_row ->> 'acceptance_seq', 5, '0')
                         || '-' || lpad(v_row ->> 'branch', 2, '0');
  ELSE
    v_owner_id := v_row ->> v_arg;
  END IF;

  IF v_owner_id IS NULL THEN
    RETURN OLD;
  END IF;

  IF "app"."doc_ref_table"(v_owner_type) IS NOT NULL
     AND "app"."is_doc_number"(v_owner_id) THEN
    IF v_mode = 'line' THEN
      SELECT c."code" INTO v_code
        FROM "app"."order_acceptances" a
        JOIN "app"."own_companies" c ON c."id" = a."own_company_id"
       WHERE a."id" = (v_row ->> 'acceptance_id')::uuid;
    ELSIF v_row ? 'own_company_id' THEN
      SELECT c."code" INTO v_code FROM "app"."own_companies" c
       WHERE c."id" = (v_row ->> 'own_company_id')::int;
    END IF;
    IF v_code IS NOT NULL THEN
      v_owner_id := v_code || '/' || v_owner_id;
    END IF;
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

-- 納品書にだけ掃除のトリガーが無かった（20260911090000 の 12 表に入っていない）。
DROP TRIGGER IF EXISTS "purge_children_after_delete" ON "app"."delivery_notes";
CREATE TRIGGER "purge_children_after_delete" AFTER DELETE ON "app"."delivery_notes"
  FOR EACH ROW EXECUTE FUNCTION "app"."purge_document_children"('delivery_notes', 'doc', 'DRN');
