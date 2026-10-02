-- 会計文書（BKPF/BSEG 相当）。転記した仕訳を DB に固定して残す — これまでは
-- GET /api/export/accounting を叩くたび lib/accounting-export-core.ts が
-- マスタ・設定から毎回計算していて、何も永続化していなかった。訂正は
-- 反対仕訳（別の文書。貸借を入れ替えたコピー）で行い、転記済みの行は
-- 二度と書き換えない — SAP FB08 と同じ形（詳細は accounting.prisma の
-- コメント）。

-- CreateEnum
CREATE TYPE "app"."ACCOUNTING_DOCUMENT_STATUS" AS ENUM ('POSTED', 'REVERSED');

-- CreateTable
CREATE TABLE "app"."accounting_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "year_month" CHAR(6) NOT NULL,
    "seq" INTEGER NOT NULL,
    "invoice_year_month" CHAR(6) NOT NULL,
    "invoice_seq" INTEGER NOT NULL,
    "status" "app"."ACCOUNTING_DOCUMENT_STATUS" NOT NULL DEFAULT 'POSTED',
    "posting_date" DATE NOT NULL,
    "settings_revision" TEXT,
    "total_debit" DECIMAL(12,2) NOT NULL,
    "reversal_of_id" UUID,
    "posted_by" UUID,
    "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversed_by" UUID,
    "reversed_at" TIMESTAMPTZ(6),
    "reverse_reason" TEXT,

    CONSTRAINT "accounting_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."accounting_document_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "tax_rate" DECIMAL(5,4) NOT NULL,
    "debit_account_code" TEXT NOT NULL,
    "debit_sub_code" TEXT NOT NULL,
    "debit_dept_code" TEXT NOT NULL,
    "debit_tax_code" TEXT NOT NULL,
    "debit_amount" DECIMAL(12,2) NOT NULL,
    "credit_account_code" TEXT NOT NULL,
    "credit_sub_code" TEXT NOT NULL,
    "credit_dept_code" TEXT NOT NULL,
    "credit_tax_code" TEXT NOT NULL,
    "credit_amount" DECIMAL(12,2) NOT NULL,
    "memo" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "accounting_document_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounting_documents_invoice_year_month_invoice_seq_idx" ON "app"."accounting_documents"("invoice_year_month", "invoice_seq");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_documents_year_month_seq_key" ON "app"."accounting_documents"("year_month", "seq");

-- 「請求書 1 通に有効な転記は 1 本だけ」の部分 unique index。Prisma の
-- @@unique では表現できない（WHERE 述語つき）ので直書きする
-- （前例: tax_categories.is_default）。
--
-- reversal_of_id IS NULL を外すと、反対仕訳文書自体（POSTED・reversalOfId が
-- 入っている）が「この請求書の現在の転記」だと誤認識される — 反対仕訳は
-- 打ち消すためだけの文書で、訂正後の再転記の受け皿ではない。この条件のおかげで
-- [元の文書 POSTED→REVERSED] → [反対仕訳 POSTED, reversalOfId≠null] →
-- [訂正後の新しい文書 POSTED, reversalOfId=null] の 3 本が同じ請求書に対して
-- 衝突なく並ぶ。
CREATE UNIQUE INDEX "accounting_documents_active_key"
  ON "app"."accounting_documents" ("invoice_year_month", "invoice_seq")
  WHERE "status" = 'POSTED' AND "reversal_of_id" IS NULL;

-- 反対仕訳済みには理由が要る（既存の「理由の無い特権付与を作らない」規約と
-- 同じ形 — privileged_access_requests.reason が前例）。
ALTER TABLE "app"."accounting_documents" ADD CONSTRAINT
  "accounting_documents_reverse_reason_check" CHECK (
    "status" <> 'REVERSED' OR ("reverse_reason" IS NOT NULL AND btrim("reverse_reason") <> '')
  );

-- CreateIndex
CREATE INDEX "accounting_document_lines_document_id_idx" ON "app"."accounting_document_lines"("document_id");

-- AddForeignKey
ALTER TABLE "app"."accounting_documents" ADD CONSTRAINT "accounting_documents_invoice_year_month_invoice_seq_fkey" FOREIGN KEY ("invoice_year_month", "invoice_seq") REFERENCES "app"."invoices"("year_month", "seq") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."accounting_documents" ADD CONSTRAINT "accounting_documents_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "app"."accounting_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."accounting_documents" ADD CONSTRAINT "accounting_documents_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."accounting_documents" ADD CONSTRAINT "accounting_documents_reversed_by_fkey" FOREIGN KEY ("reversed_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."accounting_document_lines" ADD CONSTRAINT "accounting_document_lines_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "app"."accounting_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
