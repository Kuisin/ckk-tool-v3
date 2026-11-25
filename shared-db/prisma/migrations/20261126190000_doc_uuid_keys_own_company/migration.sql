-- 書類のキーを番号から切り離し、書類に発行元の自社法人を持たせる（番号設計 PR-B）。
-- **番号はまだ 1 つも変えない**（振り直しは PR-C）。利用者から見た挙動は同じ。
--
-- なぜ要るか: PR-C で番号は PREFIX-FFFF-NNNNN の「自社法人 × 会計年度」ごとの
-- 連番になり、法人は番号に入らない。同じ番号が 2 つの法人に存在し得るので、
-- 番号（= (year_month, seq)）を行の識別に使い続けることはできない。
--
-- 1. (year_month, seq) を主キーにしていた 7 表に uuid の id を足して主キーにする。
--    (year_month, seq) は当面 UNIQUE として残す（PR-C で番号の形が変わるまで）。
-- 2. それらを (…_year_month, …_seq) で指していた子の表に <親>_id uuid を足し、
--    FK はこちらへ張り替える。旧 2 列は**残して埋め続ける**（PR-D で落とす）—
--    BEFORE INSERT/UPDATE トリガー app.sync_doc_parent_key が id ↔ (ym, seq) を
--    双方向に合わせるので、旧列だけを書く SQL（シード・スクリプト）も、id だけを
--    書くアプリも、どちらも両方が揃った行になる。旧列は NULL 可になる（アプリは
--    もう書かない — トリガーが埋める）。
--    FK の無かった参照（注文請書 → 見積書、請求明細 → 出荷書 / 納品書、
--    締日処理 → 請求書）にも id を足し、ON DELETE SET NULL の FK を張った。
-- 3. 番号を持つ書類 15 表 + 請求書に own_company_id（発行元の自社法人）を
--    NOT NULL で持たせる。作成時にアプリ（lib/doc-company.ts）が決め、以後は
--    変えない（トリガー app.own_company_id_immutable）。列の既定値は既定の法人
--    （app.default_own_company_id()）— アプリを通らない INSERT の受け皿。
--    既存行は「上流の書類の法人 → 拠点の法人 → 既定の法人」で埋める（下の
--    backfill。決め方はアプリ側 lib/doc-company-core.ts と同じ順）。

-- ════════════════════════════════════════════════════════════════════════
-- 0. 既定の法人
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION "app"."default_own_company_id"()
RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT "id" FROM "app"."own_companies" WHERE "is_default" ORDER BY "id" LIMIT 1
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 1. 親 7 表に uuid の id（既存行は gen_random_uuid() で埋まる）
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE "app"."estimates"          ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "app"."price_list_entries" ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "app"."quotes"             ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "app"."order_acceptances"  ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "app"."delivery_orders"    ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "app"."delivery_notes"     ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "app"."invoices"           ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid();

-- ════════════════════════════════════════════════════════════════════════
-- 2. 子の表に <親>_id を足して埋める
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE "app"."quote_items"                      ADD COLUMN "quote_id" UUID;
ALTER TABLE "app"."design_requests"                  ADD COLUMN "quote_id" UUID;
ALTER TABLE "app"."order_acceptances"                ADD COLUMN "quote_id" UUID,
                                                     ADD COLUMN "replaces_id" UUID;
ALTER TABLE "app"."order_acceptance_cancel_requests" ADD COLUMN "acceptance_id" UUID;
ALTER TABLE "app"."order_lines"                      ADD COLUMN "acceptance_id" UUID;
ALTER TABLE "app"."price_list_variants"              ADD COLUMN "entry_id" UUID,
                                                     ADD COLUMN "estimate_id" UUID;
ALTER TABLE "app"."delivery_order_items"             ADD COLUMN "delivery_order_id" UUID;
ALTER TABLE "app"."delivery_notes"                   ADD COLUMN "delivery_order_id" UUID;
ALTER TABLE "app"."delivery_note_items"              ADD COLUMN "delivery_note_id" UUID;
ALTER TABLE "app"."delivery_order_charges"           ADD COLUMN "delivery_order_id" UUID;
ALTER TABLE "app"."invoice_items"                    ADD COLUMN "invoice_id" UUID,
                                                     ADD COLUMN "delivery_order_id" UUID,
                                                     ADD COLUMN "delivery_note_id" UUID;
ALTER TABLE "app"."invoice_tax_summaries"            ADD COLUMN "invoice_id" UUID;
ALTER TABLE "app"."accounting_documents"             ADD COLUMN "invoice_id" UUID;
ALTER TABLE "app"."billing_closings"                 ADD COLUMN "invoice_id" UUID;

UPDATE "app"."quote_items" c SET "quote_id" = p."id" FROM "app"."quotes" p
 WHERE p."year_month" = c."quote_year_month" AND p."seq" = c."quote_seq";
UPDATE "app"."design_requests" c SET "quote_id" = p."id" FROM "app"."quotes" p
 WHERE p."year_month" = c."quote_year_month" AND p."seq" = c."quote_seq";
UPDATE "app"."order_acceptances" c SET "quote_id" = p."id" FROM "app"."quotes" p
 WHERE p."year_month" = c."quote_year_month" AND p."seq" = c."quote_seq";
UPDATE "app"."order_acceptances" c SET "replaces_id" = p."id" FROM "app"."order_acceptances" p
 WHERE p."year_month" = c."replaces_year_month" AND p."seq" = c."replaces_seq";
UPDATE "app"."order_acceptance_cancel_requests" c SET "acceptance_id" = p."id" FROM "app"."order_acceptances" p
 WHERE p."year_month" = c."acceptance_year_month" AND p."seq" = c."acceptance_seq";
UPDATE "app"."order_lines" c SET "acceptance_id" = p."id" FROM "app"."order_acceptances" p
 WHERE p."year_month" = c."acceptance_year_month" AND p."seq" = c."acceptance_seq";
UPDATE "app"."price_list_variants" c SET "entry_id" = p."id" FROM "app"."price_list_entries" p
 WHERE p."year_month" = c."entry_year_month" AND p."seq" = c."entry_seq";
UPDATE "app"."price_list_variants" c SET "estimate_id" = p."id" FROM "app"."estimates" p
 WHERE p."year_month" = c."estimate_year_month" AND p."seq" = c."estimate_seq";
UPDATE "app"."delivery_order_items" c SET "delivery_order_id" = p."id" FROM "app"."delivery_orders" p
 WHERE p."year_month" = c."delivery_order_year_month" AND p."seq" = c."delivery_order_seq";
UPDATE "app"."delivery_notes" c SET "delivery_order_id" = p."id" FROM "app"."delivery_orders" p
 WHERE p."year_month" = c."delivery_order_year_month" AND p."seq" = c."delivery_order_seq";
UPDATE "app"."delivery_note_items" c SET "delivery_note_id" = p."id" FROM "app"."delivery_notes" p
 WHERE p."year_month" = c."delivery_note_year_month" AND p."seq" = c."delivery_note_seq";
UPDATE "app"."delivery_order_charges" c SET "delivery_order_id" = p."id" FROM "app"."delivery_orders" p
 WHERE p."year_month" = c."delivery_order_year_month" AND p."seq" = c."delivery_order_seq";
UPDATE "app"."invoice_items" c SET "invoice_id" = p."id" FROM "app"."invoices" p
 WHERE p."year_month" = c."invoice_year_month" AND p."seq" = c."invoice_seq";
UPDATE "app"."invoice_items" c SET "delivery_order_id" = p."id" FROM "app"."delivery_orders" p
 WHERE p."year_month" = c."delivery_order_year_month" AND p."seq" = c."delivery_order_seq";
UPDATE "app"."invoice_items" c SET "delivery_note_id" = p."id" FROM "app"."delivery_notes" p
 WHERE p."year_month" = c."delivery_note_year_month" AND p."seq" = c."delivery_note_seq";
UPDATE "app"."invoice_tax_summaries" c SET "invoice_id" = p."id" FROM "app"."invoices" p
 WHERE p."year_month" = c."invoice_year_month" AND p."seq" = c."invoice_seq";
UPDATE "app"."accounting_documents" c SET "invoice_id" = p."id" FROM "app"."invoices" p
 WHERE p."year_month" = c."invoice_year_month" AND p."seq" = c."invoice_seq";
UPDATE "app"."billing_closings" c SET "invoice_id" = p."id" FROM "app"."invoices" p
 WHERE p."year_month" = c."invoice_year_month" AND p."seq" = c."invoice_seq";

-- 旧 FK のあった参照は必ず当たる（FK が親の存在を保証していた）。FK の無かった
-- 参照（注文請書 → 見積書 等）で親の無い旧値は、id が NULL のまま残る。
-- 旧列の値も NULL に揃える（トリガーが無いまま両者が食い違う行を作らない）。
UPDATE "app"."order_acceptances" SET "quote_year_month" = NULL, "quote_seq" = NULL
 WHERE "quote_id" IS NULL AND "quote_year_month" IS NOT NULL;
UPDATE "app"."invoice_items" SET "delivery_order_year_month" = NULL, "delivery_order_seq" = NULL
 WHERE "delivery_order_id" IS NULL AND "delivery_order_year_month" IS NOT NULL;
UPDATE "app"."invoice_items" SET "delivery_note_year_month" = NULL, "delivery_note_seq" = NULL
 WHERE "delivery_note_id" IS NULL AND "delivery_note_year_month" IS NOT NULL;
UPDATE "app"."billing_closings" SET "invoice_year_month" = NULL, "invoice_seq" = NULL
 WHERE "invoice_id" IS NULL AND "invoice_year_month" IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════
-- 3. 旧 FK を外し、主キーを id へ。(year_month, seq) は UNIQUE で残す
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE "app"."accounting_documents" DROP CONSTRAINT "accounting_documents_invoice_year_month_invoice_seq_fkey";
ALTER TABLE "app"."delivery_note_items" DROP CONSTRAINT "delivery_note_items_delivery_note_year_month_delivery_note_fkey";
ALTER TABLE "app"."delivery_notes" DROP CONSTRAINT "delivery_notes_delivery_order_year_month_delivery_order_se_fkey";
ALTER TABLE "app"."delivery_order_charges" DROP CONSTRAINT "delivery_order_charges_delivery_order_year_month_delivery__fkey";
ALTER TABLE "app"."delivery_order_items" DROP CONSTRAINT "delivery_order_items_delivery_order_year_month_delivery_or_fkey";
ALTER TABLE "app"."design_requests" DROP CONSTRAINT "design_requests_quote_year_month_quote_seq_fkey";
ALTER TABLE "app"."invoice_items" DROP CONSTRAINT "invoice_items_invoice_year_month_invoice_seq_fkey";
ALTER TABLE "app"."invoice_tax_summaries" DROP CONSTRAINT "invoice_tax_summaries_invoice_year_month_invoice_seq_fkey";
ALTER TABLE "app"."order_acceptance_cancel_requests" DROP CONSTRAINT "order_acceptance_cancel_requests_acceptance_year_month_acc_fkey";
ALTER TABLE "app"."order_acceptances" DROP CONSTRAINT "order_acceptances_replaces_year_month_replaces_seq_fkey";
ALTER TABLE "app"."order_lines" DROP CONSTRAINT "order_lines_acceptance_year_month_acceptance_seq_fkey";
ALTER TABLE "app"."price_list_variants" DROP CONSTRAINT "price_list_variants_entry_year_month_entry_seq_fkey";
ALTER TABLE "app"."price_list_variants" DROP CONSTRAINT "price_list_variants_estimate_year_month_estimate_seq_fkey";
ALTER TABLE "app"."quote_items" DROP CONSTRAINT "quote_items_quote_year_month_quote_seq_fkey";

ALTER TABLE "app"."estimates"          DROP CONSTRAINT "estimates_pkey",          ADD CONSTRAINT "estimates_pkey" PRIMARY KEY ("id");
ALTER TABLE "app"."price_list_entries" DROP CONSTRAINT "price_list_entries_pkey", ADD CONSTRAINT "price_list_entries_pkey" PRIMARY KEY ("id");
ALTER TABLE "app"."quotes"             DROP CONSTRAINT "quotes_pkey",             ADD CONSTRAINT "quotes_pkey" PRIMARY KEY ("id");
ALTER TABLE "app"."order_acceptances"  DROP CONSTRAINT "order_acceptances_pkey",  ADD CONSTRAINT "order_acceptances_pkey" PRIMARY KEY ("id");
ALTER TABLE "app"."delivery_orders"    DROP CONSTRAINT "delivery_orders_pkey",    ADD CONSTRAINT "delivery_orders_pkey" PRIMARY KEY ("id");
ALTER TABLE "app"."delivery_notes"     DROP CONSTRAINT "delivery_notes_pkey",     ADD CONSTRAINT "delivery_notes_pkey" PRIMARY KEY ("id");
ALTER TABLE "app"."invoices"           DROP CONSTRAINT "invoices_pkey",           ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");

CREATE UNIQUE INDEX "estimates_year_month_seq_key"          ON "app"."estimates"("year_month", "seq");
CREATE UNIQUE INDEX "price_list_entries_year_month_seq_key" ON "app"."price_list_entries"("year_month", "seq");
CREATE UNIQUE INDEX "quotes_year_month_seq_key"             ON "app"."quotes"("year_month", "seq");
CREATE UNIQUE INDEX "order_acceptances_year_month_seq_key"  ON "app"."order_acceptances"("year_month", "seq");
CREATE UNIQUE INDEX "delivery_orders_year_month_seq_key"    ON "app"."delivery_orders"("year_month", "seq");
CREATE UNIQUE INDEX "delivery_notes_year_month_seq_key"     ON "app"."delivery_notes"("year_month", "seq");
CREATE UNIQUE INDEX "invoices_year_month_seq_key"           ON "app"."invoices"("year_month", "seq");

-- ════════════════════════════════════════════════════════════════════════
-- 4. 子の id を必須にし（必須の参照だけ）、旧列は NULL 可へ。新しい FK・索引
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE "app"."quote_items" ALTER COLUMN "quote_id" SET NOT NULL,
  ALTER COLUMN "quote_year_month" DROP NOT NULL, ALTER COLUMN "quote_seq" DROP NOT NULL;
ALTER TABLE "app"."order_acceptance_cancel_requests" ALTER COLUMN "acceptance_id" SET NOT NULL,
  ALTER COLUMN "acceptance_year_month" DROP NOT NULL, ALTER COLUMN "acceptance_seq" DROP NOT NULL;
ALTER TABLE "app"."order_lines" ALTER COLUMN "acceptance_id" SET NOT NULL,
  ALTER COLUMN "acceptance_year_month" DROP NOT NULL, ALTER COLUMN "acceptance_seq" DROP NOT NULL;
ALTER TABLE "app"."price_list_variants" ALTER COLUMN "entry_id" SET NOT NULL,
  ALTER COLUMN "entry_year_month" DROP NOT NULL, ALTER COLUMN "entry_seq" DROP NOT NULL;
ALTER TABLE "app"."delivery_order_items" ALTER COLUMN "delivery_order_id" SET NOT NULL,
  ALTER COLUMN "delivery_order_year_month" DROP NOT NULL, ALTER COLUMN "delivery_order_seq" DROP NOT NULL;
ALTER TABLE "app"."delivery_notes" ALTER COLUMN "delivery_order_id" SET NOT NULL,
  ALTER COLUMN "delivery_order_year_month" DROP NOT NULL, ALTER COLUMN "delivery_order_seq" DROP NOT NULL;
ALTER TABLE "app"."delivery_note_items" ALTER COLUMN "delivery_note_id" SET NOT NULL,
  ALTER COLUMN "delivery_note_year_month" DROP NOT NULL, ALTER COLUMN "delivery_note_seq" DROP NOT NULL;
ALTER TABLE "app"."delivery_order_charges" ALTER COLUMN "delivery_order_id" SET NOT NULL,
  ALTER COLUMN "delivery_order_year_month" DROP NOT NULL, ALTER COLUMN "delivery_order_seq" DROP NOT NULL;
ALTER TABLE "app"."invoice_items" ALTER COLUMN "invoice_id" SET NOT NULL,
  ALTER COLUMN "invoice_year_month" DROP NOT NULL, ALTER COLUMN "invoice_seq" DROP NOT NULL;
ALTER TABLE "app"."invoice_tax_summaries" ALTER COLUMN "invoice_id" SET NOT NULL,
  ALTER COLUMN "invoice_year_month" DROP NOT NULL, ALTER COLUMN "invoice_seq" DROP NOT NULL;
ALTER TABLE "app"."accounting_documents" ALTER COLUMN "invoice_id" SET NOT NULL,
  ALTER COLUMN "invoice_year_month" DROP NOT NULL, ALTER COLUMN "invoice_seq" DROP NOT NULL;

-- 旧列を含んでいた一意制約は id 側へ移す（同じ意味の制約）
DROP INDEX "app"."invoice_tax_summaries_invoice_year_month_invoice_seq_tax_ra_key";
DROP INDEX "app"."order_lines_acceptance_year_month_acceptance_seq_branch_key";
DROP INDEX "app"."price_list_variants_entry_year_month_entry_seq_order_type_key";
CREATE UNIQUE INDEX "invoice_tax_summaries_invoice_id_tax_rate_key" ON "app"."invoice_tax_summaries"("invoice_id", "tax_rate");
CREATE UNIQUE INDEX "order_lines_acceptance_id_branch_key" ON "app"."order_lines"("acceptance_id", "branch");
CREATE UNIQUE INDEX "price_list_variants_entry_id_order_type_key" ON "app"."price_list_variants"("entry_id", "order_type");

CREATE INDEX "quote_items_quote_id_idx" ON "app"."quote_items"("quote_id");
CREATE INDEX "design_requests_quote_id_idx" ON "app"."design_requests"("quote_id");
CREATE INDEX "order_acceptances_quote_id_idx" ON "app"."order_acceptances"("quote_id");
CREATE INDEX "order_acceptances_replaces_id_idx" ON "app"."order_acceptances"("replaces_id");
CREATE INDEX "order_acceptance_cancel_requests_acceptance_id_idx" ON "app"."order_acceptance_cancel_requests"("acceptance_id");
CREATE INDEX "price_list_variants_estimate_id_idx" ON "app"."price_list_variants"("estimate_id");
CREATE INDEX "delivery_order_items_delivery_order_id_idx" ON "app"."delivery_order_items"("delivery_order_id");
CREATE INDEX "delivery_notes_delivery_order_id_idx" ON "app"."delivery_notes"("delivery_order_id");
CREATE INDEX "delivery_note_items_delivery_note_id_idx" ON "app"."delivery_note_items"("delivery_note_id");
CREATE INDEX "delivery_order_charges_delivery_order_id_idx" ON "app"."delivery_order_charges"("delivery_order_id");
CREATE INDEX "invoice_items_invoice_id_idx" ON "app"."invoice_items"("invoice_id");
CREATE INDEX "invoice_items_delivery_order_id_idx" ON "app"."invoice_items"("delivery_order_id");
CREATE INDEX "invoice_items_delivery_note_id_idx" ON "app"."invoice_items"("delivery_note_id");
CREATE INDEX "accounting_documents_invoice_id_idx" ON "app"."accounting_documents"("invoice_id");
CREATE INDEX "billing_closings_invoice_id_idx" ON "app"."billing_closings"("invoice_id");

-- 部分 unique index（Prisma で表現できない）も id 側に同じものを置く。旧列の
-- ものは旧列が埋まっている間は同じ意味なので PR-D まで残す。
CREATE UNIQUE INDEX "order_acceptance_cancel_requests_one_pending_by_id"
  ON "app"."order_acceptance_cancel_requests"("acceptance_id") WHERE ("status" = 'PENDING');
CREATE UNIQUE INDEX "accounting_documents_active_by_invoice_id"
  ON "app"."accounting_documents"("invoice_id")
  WHERE ("status" = 'POSTED' AND "reversal_of_id" IS NULL);

-- onDelete / onUpdate は旧 FK と同じ（Prisma の既定 = ON UPDATE CASCADE）。
ALTER TABLE "app"."quote_items" ADD CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "app"."quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."design_requests" ADD CONSTRAINT "design_requests_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "app"."quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."order_acceptances" ADD CONSTRAINT "order_acceptances_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "app"."quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."order_acceptances" ADD CONSTRAINT "order_acceptances_replaces_id_fkey" FOREIGN KEY ("replaces_id") REFERENCES "app"."order_acceptances"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "app"."order_acceptance_cancel_requests" ADD CONSTRAINT "order_acceptance_cancel_requests_acceptance_id_fkey" FOREIGN KEY ("acceptance_id") REFERENCES "app"."order_acceptances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."order_lines" ADD CONSTRAINT "order_lines_acceptance_id_fkey" FOREIGN KEY ("acceptance_id") REFERENCES "app"."order_acceptances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."price_list_variants" ADD CONSTRAINT "price_list_variants_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "app"."price_list_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."price_list_variants" ADD CONSTRAINT "price_list_variants_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "app"."estimates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."delivery_order_items" ADD CONSTRAINT "delivery_order_items_delivery_order_id_fkey" FOREIGN KEY ("delivery_order_id") REFERENCES "app"."delivery_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."delivery_notes" ADD CONSTRAINT "delivery_notes_delivery_order_id_fkey" FOREIGN KEY ("delivery_order_id") REFERENCES "app"."delivery_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."delivery_note_items" ADD CONSTRAINT "delivery_note_items_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "app"."delivery_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."delivery_order_charges" ADD CONSTRAINT "delivery_order_charges_delivery_order_id_fkey" FOREIGN KEY ("delivery_order_id") REFERENCES "app"."delivery_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "app"."invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."invoice_items" ADD CONSTRAINT "invoice_items_delivery_order_id_fkey" FOREIGN KEY ("delivery_order_id") REFERENCES "app"."delivery_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."invoice_items" ADD CONSTRAINT "invoice_items_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "app"."delivery_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."invoice_tax_summaries" ADD CONSTRAINT "invoice_tax_summaries_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "app"."invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."accounting_documents" ADD CONSTRAINT "accounting_documents_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "app"."invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."billing_closings" ADD CONSTRAINT "billing_closings_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "app"."invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════════
-- 5. id ↔ (year_month, seq) の同期トリガー（PR-D で旧列ごと消す）
-- ════════════════════════════════════════════════════════════════════════
-- 引数: <id 列> <year_month 列> <seq 列> <親の表>
-- 規則: INSERT は id があれば id から旧列を、無ければ旧列から id を埋める。
--       UPDATE は変わった側から、もう片方を合わせる（id を優先）。
--       片側を NULL にすれば、もう片側も NULL になる（任意の参照の付け外し）。
-- 親の行が見つからない値は合わせず NULL のまま — 必須の参照なら NOT NULL / FK が
-- そこで落とす（黙って別の行へ繋がない）。
CREATE OR REPLACE FUNCTION "app"."sync_doc_parent_key"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  id_col  text  := TG_ARGV[0];
  ym_col  text  := TG_ARGV[1];
  seq_col text  := TG_ARGV[2];
  parent  text  := TG_ARGV[3];
  n       jsonb := to_jsonb(NEW);
  o       jsonb;
  from_id boolean;
  v_id    uuid;
  v_ym    text;
  v_seq   int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    from_id := (n ->> id_col) IS NOT NULL OR (n ->> ym_col) IS NULL;
  ELSE
    o := to_jsonb(OLD);
    IF (o ->> id_col) IS DISTINCT FROM (n ->> id_col) THEN
      from_id := true;
    ELSIF (o ->> ym_col) IS DISTINCT FROM (n ->> ym_col)
       OR (o ->> seq_col) IS DISTINCT FROM (n ->> seq_col) THEN
      from_id := false;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF from_id THEN
    IF (n ->> id_col) IS NOT NULL THEN
      EXECUTE format('SELECT "year_month", "seq" FROM "app".%I WHERE "id" = $1', parent)
         INTO v_ym, v_seq USING (n ->> id_col)::uuid;
    END IF;
    NEW := jsonb_populate_record(NEW, jsonb_build_object(ym_col, v_ym, seq_col, v_seq));
  ELSE
    IF (n ->> ym_col) IS NOT NULL AND (n ->> seq_col) IS NOT NULL THEN
      EXECUTE format('SELECT "id" FROM "app".%I WHERE "year_month" = $1 AND "seq" = $2', parent)
         INTO v_id USING (n ->> ym_col), (n ->> seq_col)::int;
    END IF;
    NEW := jsonb_populate_record(NEW, jsonb_build_object(id_col, v_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "sync_quote_id" BEFORE INSERT OR UPDATE OF "quote_id", "quote_year_month", "quote_seq"
  ON "app"."quote_items" FOR EACH ROW
  EXECUTE FUNCTION "app"."sync_doc_parent_key"('quote_id', 'quote_year_month', 'quote_seq', 'quotes');
CREATE TRIGGER "sync_quote_id" BEFORE INSERT OR UPDATE OF "quote_id", "quote_year_month", "quote_seq"
  ON "app"."design_requests" FOR EACH ROW
  EXECUTE FUNCTION "app"."sync_doc_parent_key"('quote_id', 'quote_year_month', 'quote_seq', 'quotes');
CREATE TRIGGER "sync_quote_id" BEFORE INSERT OR UPDATE OF "quote_id", "quote_year_month", "quote_seq"
  ON "app"."order_acceptances" FOR EACH ROW
  EXECUTE FUNCTION "app"."sync_doc_parent_key"('quote_id', 'quote_year_month', 'quote_seq', 'quotes');
CREATE TRIGGER "sync_replaces_id" BEFORE INSERT OR UPDATE OF "replaces_id", "replaces_year_month", "replaces_seq"
  ON "app"."order_acceptances" FOR EACH ROW
  EXECUTE FUNCTION "app"."sync_doc_parent_key"('replaces_id', 'replaces_year_month', 'replaces_seq', 'order_acceptances');
CREATE TRIGGER "sync_acceptance_id" BEFORE INSERT OR UPDATE OF "acceptance_id", "acceptance_year_month", "acceptance_seq"
  ON "app"."order_acceptance_cancel_requests" FOR EACH ROW
  EXECUTE FUNCTION "app"."sync_doc_parent_key"('acceptance_id', 'acceptance_year_month', 'acceptance_seq', 'order_acceptances');
CREATE TRIGGER "sync_acceptance_id" BEFORE INSERT OR UPDATE OF "acceptance_id", "acceptance_year_month", "acceptance_seq"
  ON "app"."order_lines" FOR EACH ROW
  EXECUTE FUNCTION "app"."sync_doc_parent_key"('acceptance_id', 'acceptance_year_month', 'acceptance_seq', 'order_acceptances');
CREATE TRIGGER "sync_entry_id" BEFORE INSERT OR UPDATE OF "entry_id", "entry_year_month", "entry_seq"
  ON "app"."price_list_variants" FOR EACH ROW
  EXECUTE FUNCTION "app"."sync_doc_parent_key"('entry_id', 'entry_year_month', 'entry_seq', 'price_list_entries');
CREATE TRIGGER "sync_estimate_id" BEFORE INSERT OR UPDATE OF "estimate_id", "estimate_year_month", "estimate_seq"
  ON "app"."price_list_variants" FOR EACH ROW
  EXECUTE FUNCTION "app"."sync_doc_parent_key"('estimate_id', 'estimate_year_month', 'estimate_seq', 'estimates');
CREATE TRIGGER "sync_delivery_order_id" BEFORE INSERT OR UPDATE OF "delivery_order_id", "delivery_order_year_month", "delivery_order_seq"
  ON "app"."delivery_order_items" FOR EACH ROW
  EXECUTE FUNCTION "app"."sync_doc_parent_key"('delivery_order_id', 'delivery_order_year_month', 'delivery_order_seq', 'delivery_orders');
CREATE TRIGGER "sync_delivery_order_id" BEFORE INSERT OR UPDATE OF "delivery_order_id", "delivery_order_year_month", "delivery_order_seq"
  ON "app"."delivery_notes" FOR EACH ROW
  EXECUTE FUNCTION "app"."sync_doc_parent_key"('delivery_order_id', 'delivery_order_year_month', 'delivery_order_seq', 'delivery_orders');
CREATE TRIGGER "sync_delivery_note_id" BEFORE INSERT OR UPDATE OF "delivery_note_id", "delivery_note_year_month", "delivery_note_seq"
  ON "app"."delivery_note_items" FOR EACH ROW
  EXECUTE FUNCTION "app"."sync_doc_parent_key"('delivery_note_id', 'delivery_note_year_month', 'delivery_note_seq', 'delivery_notes');
CREATE TRIGGER "sync_delivery_order_id" BEFORE INSERT OR UPDATE OF "delivery_order_id", "delivery_order_year_month", "delivery_order_seq"
  ON "app"."delivery_order_charges" FOR EACH ROW
  EXECUTE FUNCTION "app"."sync_doc_parent_key"('delivery_order_id', 'delivery_order_year_month', 'delivery_order_seq', 'delivery_orders');
CREATE TRIGGER "sync_invoice_id" BEFORE INSERT OR UPDATE OF "invoice_id", "invoice_year_month", "invoice_seq"
  ON "app"."invoice_items" FOR EACH ROW
  EXECUTE FUNCTION "app"."sync_doc_parent_key"('invoice_id', 'invoice_year_month', 'invoice_seq', 'invoices');
CREATE TRIGGER "sync_delivery_order_id" BEFORE INSERT OR UPDATE OF "delivery_order_id", "delivery_order_year_month", "delivery_order_seq"
  ON "app"."invoice_items" FOR EACH ROW
  EXECUTE FUNCTION "app"."sync_doc_parent_key"('delivery_order_id', 'delivery_order_year_month', 'delivery_order_seq', 'delivery_orders');
CREATE TRIGGER "sync_delivery_note_id" BEFORE INSERT OR UPDATE OF "delivery_note_id", "delivery_note_year_month", "delivery_note_seq"
  ON "app"."invoice_items" FOR EACH ROW
  EXECUTE FUNCTION "app"."sync_doc_parent_key"('delivery_note_id', 'delivery_note_year_month', 'delivery_note_seq', 'delivery_notes');
CREATE TRIGGER "sync_invoice_id" BEFORE INSERT OR UPDATE OF "invoice_id", "invoice_year_month", "invoice_seq"
  ON "app"."invoice_tax_summaries" FOR EACH ROW
  EXECUTE FUNCTION "app"."sync_doc_parent_key"('invoice_id', 'invoice_year_month', 'invoice_seq', 'invoices');
CREATE TRIGGER "sync_invoice_id" BEFORE INSERT OR UPDATE OF "invoice_id", "invoice_year_month", "invoice_seq"
  ON "app"."accounting_documents" FOR EACH ROW
  EXECUTE FUNCTION "app"."sync_doc_parent_key"('invoice_id', 'invoice_year_month', 'invoice_seq', 'invoices');
CREATE TRIGGER "sync_invoice_id" BEFORE INSERT OR UPDATE OF "invoice_id", "invoice_year_month", "invoice_seq"
  ON "app"."billing_closings" FOR EACH ROW
  EXECUTE FUNCTION "app"."sync_doc_parent_key"('invoice_id', 'invoice_year_month', 'invoice_seq', 'invoices');

-- ════════════════════════════════════════════════════════════════════════
-- 6. 書類の発行元（own_company_id）
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE "app"."estimates"                ADD COLUMN "own_company_id" INTEGER;
ALTER TABLE "app"."price_list_entries"       ADD COLUMN "own_company_id" INTEGER;
ALTER TABLE "app"."quotes"                   ADD COLUMN "own_company_id" INTEGER;
ALTER TABLE "app"."order_acceptances"        ADD COLUMN "own_company_id" INTEGER;
ALTER TABLE "app"."delivery_orders"          ADD COLUMN "own_company_id" INTEGER;
ALTER TABLE "app"."delivery_notes"           ADD COLUMN "own_company_id" INTEGER;
ALTER TABLE "app"."material_purchase_orders" ADD COLUMN "own_company_id" INTEGER;
ALTER TABLE "app"."purchase_requests"        ADD COLUMN "own_company_id" INTEGER;
ALTER TABLE "app"."design_requests"          ADD COLUMN "own_company_id" INTEGER;
ALTER TABLE "app"."work_orders"              ADD COLUMN "own_company_id" INTEGER;
ALTER TABLE "app"."form_responses"           ADD COLUMN "own_company_id" INTEGER;
ALTER TABLE "app"."internal_pages"           ADD COLUMN "own_company_id" INTEGER;
ALTER TABLE "app"."inventory_movements"      ADD COLUMN "own_company_id" INTEGER;
ALTER TABLE "app"."stock_takes"              ADD COLUMN "own_company_id" INTEGER;
ALTER TABLE "app"."accounting_documents"     ADD COLUMN "own_company_id" INTEGER;
-- invoices.own_company_id は 20261126120000_own_companies で入っている（NULL 可）

-- backfill — 上流の書類 → 拠点 → 既定 の順（lib/doc-company-core.ts と同じ）。
-- 上流が下流より先に埋まるよう、書類の流れの順に並べてある。

-- 拠点からも上流からも決まらない書類（見積・価格試算・価格表・フォーム・社内文書）
UPDATE "app"."estimates"          SET "own_company_id" = "app"."default_own_company_id"();
UPDATE "app"."price_list_entries" SET "own_company_id" = "app"."default_own_company_id"();
UPDATE "app"."quotes"             SET "own_company_id" = "app"."default_own_company_id"();
UPDATE "app"."form_responses"     SET "own_company_id" = "app"."default_own_company_id"();
UPDATE "app"."internal_pages"     SET "own_company_id" = "app"."default_own_company_id"();

-- 注文請書: 担当拠点 → 明細の担当拠点（並び順で最初） → 見積書 → 既定
UPDATE "app"."order_acceptances" a SET "own_company_id" = COALESCE(
  (SELECT p."own_company_id" FROM "app"."plants" p WHERE p."id" = a."assigned_plant_id"),
  (SELECT p."own_company_id" FROM "app"."order_lines" l JOIN "app"."plants" p ON p."id" = l."assigned_plant_id"
    WHERE l."acceptance_id" = a."id" AND p."own_company_id" IS NOT NULL
    ORDER BY l."sort_order", l."id" LIMIT 1),
  (SELECT q."own_company_id" FROM "app"."quotes" q WHERE q."id" = a."quote_id"),
  "app"."default_own_company_id"());

-- 設計依頼書: 見積書 → 注文明細の注文請書 → 既定
UPDATE "app"."design_requests" d SET "own_company_id" = COALESCE(
  (SELECT q."own_company_id" FROM "app"."quotes" q WHERE q."id" = d."quote_id"),
  (SELECT a."own_company_id" FROM "app"."order_lines" l JOIN "app"."order_acceptances" a ON a."id" = l."acceptance_id"
    WHERE l."id" = d."order_line_id"),
  "app"."default_own_company_id"());

-- 指示書: 割当てた注文明細の注文請書（割当の並び順で最初） → 既定
UPDATE "app"."work_orders" w SET "own_company_id" = COALESCE(
  (SELECT a."own_company_id" FROM "app"."work_order_order_lines" x
     JOIN "app"."order_lines" l ON l."id" = x."order_line_id"
     JOIN "app"."order_acceptances" a ON a."id" = l."acceptance_id"
    WHERE x."work_order_id" = w."id"
    ORDER BY x."sort_order", x."created_at" LIMIT 1),
  "app"."default_own_company_id"());

-- 出荷書: 出荷元拠点 → 明細の注文明細の担当拠点（並び順で最初） → 既定
-- （請求書の束ね lib/own-companies.ts shipmentOwnCompanyId と同じ順）
UPDATE "app"."delivery_orders" o SET "own_company_id" = COALESCE(
  (SELECT p."own_company_id" FROM "app"."plants" p WHERE p."id" = o."from_plant_id"),
  (SELECT p."own_company_id" FROM "app"."delivery_order_items" i
     JOIN "app"."order_lines" l ON l."id" = i."order_line_id"
     JOIN "app"."plants" p ON p."id" = l."assigned_plant_id"
    WHERE i."delivery_order_id" = o."id" AND p."own_company_id" IS NOT NULL
    ORDER BY i."sort_order", i."id" LIMIT 1),
  "app"."default_own_company_id"());

-- 納品書: 出荷書
UPDATE "app"."delivery_notes" n SET "own_company_id" = COALESCE(
  (SELECT o."own_company_id" FROM "app"."delivery_orders" o WHERE o."id" = n."delivery_order_id"),
  "app"."default_own_company_id"());

-- 請求書: 発行時に決めた値（既にある）→ 既定
UPDATE "app"."invoices" SET "own_company_id" = "app"."default_own_company_id"()
 WHERE "own_company_id" IS NULL;

-- 会計文書: 請求書
UPDATE "app"."accounting_documents" d SET "own_company_id" = COALESCE(
  (SELECT i."own_company_id" FROM "app"."invoices" i WHERE i."id" = d."invoice_id"),
  "app"."default_own_company_id"());

-- 素材発注書・購買依頼: 明細の入荷先 / 希望拠点（並び順で最初） → 既定
UPDATE "app"."material_purchase_orders" o SET "own_company_id" = COALESCE(
  (SELECT p."own_company_id" FROM "app"."material_purchase_order_items" i
     JOIN "app"."plants" p ON p."id" = i."plant_id"
    WHERE i."purchase_order_id" = o."id" AND p."own_company_id" IS NOT NULL
    ORDER BY i."sort_order", i."id" LIMIT 1),
  "app"."default_own_company_id"());
UPDATE "app"."purchase_requests" r SET "own_company_id" = COALESCE(
  (SELECT p."own_company_id" FROM "app"."purchase_request_items" i
     JOIN "app"."plants" p ON p."id" = i."plant_id"
    WHERE i."request_id" = r."id" AND p."own_company_id" IS NOT NULL
    ORDER BY i."sort_order", i."id" LIMIT 1),
  "app"."default_own_company_id"());

-- 入出庫伝票・棚卸: 拠点 → 既定
UPDATE "app"."inventory_movements" m SET "own_company_id" = COALESCE(
  (SELECT p."own_company_id" FROM "app"."plants" p WHERE p."id" = m."plant_id"),
  "app"."default_own_company_id"());
UPDATE "app"."stock_takes" s SET "own_company_id" = COALESCE(
  (SELECT p."own_company_id" FROM "app"."plants" p WHERE p."id" = s."plant_id"),
  "app"."default_own_company_id"());

-- 既定・NOT NULL・FK・索引・変更禁止トリガー
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'estimates', 'price_list_entries', 'quotes', 'order_acceptances', 'delivery_orders',
    'delivery_notes', 'invoices', 'material_purchase_orders', 'purchase_requests',
    'design_requests', 'work_orders', 'form_responses', 'internal_pages',
    'inventory_movements', 'stock_takes', 'accounting_documents'
  ] LOOP
    EXECUTE format('ALTER TABLE "app".%I ALTER COLUMN "own_company_id" SET DEFAULT app.default_own_company_id(), ALTER COLUMN "own_company_id" SET NOT NULL', t);
    IF t <> 'invoices' THEN
      EXECUTE format('ALTER TABLE "app".%I ADD CONSTRAINT %I FOREIGN KEY ("own_company_id") REFERENCES "app"."own_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
                     t, t || '_own_company_id_fkey');
      EXECUTE format('CREATE INDEX %I ON "app".%I ("own_company_id")', t || '_own_company_id_idx', t);
    END IF;
  END LOOP;
END $$;

-- 発行元は作成後に変えない。番号（PR-C）は法人 × 年度の連番から払い出すので、
-- 法人を付け替えると「その法人の番号表に無い番号」を持つ書類ができる。
-- 画面にも付け替える口は無いが、psql やスクリプトからの変更も DB で止める。
CREATE OR REPLACE FUNCTION "app"."own_company_id_immutable"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."own_company_id" IS DISTINCT FROM OLD."own_company_id" THEN
    RAISE EXCEPTION '%.own_company_id is immutable (% -> %)', TG_TABLE_NAME,
      OLD."own_company_id", NEW."own_company_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'estimates', 'price_list_entries', 'quotes', 'order_acceptances', 'delivery_orders',
    'delivery_notes', 'invoices', 'material_purchase_orders', 'purchase_requests',
    'design_requests', 'work_orders', 'form_responses', 'internal_pages',
    'inventory_movements', 'stock_takes', 'accounting_documents'
  ] LOOP
    EXECUTE format('CREATE TRIGGER "own_company_id_immutable" BEFORE UPDATE OF "own_company_id" ON "app".%I FOR EACH ROW EXECUTE FUNCTION "app"."own_company_id_immutable"()', t);
  END LOOP;
END $$;
