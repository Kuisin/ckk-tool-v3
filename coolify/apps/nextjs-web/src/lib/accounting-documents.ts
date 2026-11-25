/**
 * lib/accounting-documents.ts — 会計文書の永続化（転記・反対仕訳）。server-only.
 *
 * SAP の会計文書（BKPF/BSEG）を参考に、**転記した瞬間に仕訳行を固定して
 * DB へ残す**。以後マスタ（税区分・取引先の科目コード・SY0J 設定）が変わっても
 * 転記済みの文書は動かない。訂正は行を書き換えず、**反対仕訳**（貸借を入れ替えた
 * 別の文書。SAP FB08 と同じ形）で行う。
 *
 * 権限チェックは呼び出し側の責務（`generateInvoiceForClosing` と同じ規約） —
 * ここの関数はすでに権限を確認済みの呼び出し元からだけ呼ばれることを前提にする。
 * `postAccountingDocument` は `app/api/export/accounting/route.ts`
 * （`requirePermissionResponse("billing_closing","EXPORT")` 済み）から、
 * `reverseAccountingDocumentCore` は `billing/invoices/actions.ts` の
 * `reverseAccountingDocument`（`checkPermission("billing_closing","EXPORT")` 済み）
 * から呼ぶ。
 */

import { getTranslations } from "next-intl/server";
import {
  fetchInvoice,
  fetchInvoiceAccountingParty,
} from "@/app/(dashboard)/billing/invoices/data";
import { resolveTaxBuckets } from "@/components/billing/invoices/model";
import {
  lineToJournalRow,
  type PersistedJournalLine,
} from "@/lib/accounting-documents-core";
import {
  buildJournalRows,
  conflictingTaxRates,
  type JournalRow,
} from "@/lib/accounting-export-core";
import {
  getAccountingSettings,
  getAccountingSettingsRevision,
} from "@/lib/accounting-settings";
import { recordAudit } from "@/lib/audit";
import { type Prisma, prisma } from "@/lib/db";
import { companyForAccountingDocument } from "@/lib/doc-company-core";
import {
  type DocKey,
  docIdOf,
  docNumberOf,
  docNumberParts,
} from "@/lib/doc-number";
import { toDocRef } from "@/lib/doc-ref";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";

export type { PersistedJournalLine } from "@/lib/accounting-documents-core";
export { lineToJournalRow } from "@/lib/accounting-documents-core";

/**
 * 会計文書 1 行（画面の履歴パネル・一覧向け。明細行は持たない）。
 *
 * `documentNumber` / `invoiceNumber` は **id の姿**（`CKK~ACC-2026-00001`）—
 * 画面がリンクと Server Action にそのまま渡す。表示するときは `<DocNumber>` /
 * `docNo()` で番号だけにする（lib/doc-number.ts）。
 */
export interface AccountingDocumentSummary {
  documentNumber: string;
  invoiceNumber: string;
  /** 振り直し前の番号（旧 ACC-YYYYMM-NNNNN）。検索用。無ければ null。 */
  legacyNumber: string | null;
  status: "POSTED" | "REVERSED";
  /** 反対仕訳文書か（`reversalOf` が入っているか）。 */
  isReversal: boolean;
  postingDate: string;
  totalDebit: number;
  postedAt: string;
  postedByName: string | null;
  reversedAt: string | null;
  reversedByName: string | null;
  reverseReason: string | null;
}

/** 明細行込みの会計文書（CSV を描き直すときに使う）。 */
export interface AccountingDocumentWithRows extends AccountingDocumentSummary {
  rows: JournalRow[];
}

type DocumentRow = NonNullable<Awaited<ReturnType<typeof findDocumentRow>>>;

const DOCUMENT_INCLUDE = {
  lines: { orderBy: { sortOrder: "asc" } },
  postedByUser: { select: { displayName: true } },
  reversedByUser: { select: { displayName: true } },
  // 元の請求書は uuid（invoice_id）で指す。番号は関連から読む。
  invoice: { select: { docRef: true, legacyNumber: true } },
} satisfies Prisma.AccountingDocumentInclude;

function findDocumentRow(where: Prisma.AccountingDocumentWhereInput) {
  return prisma.accountingDocument.findFirst({
    where,
    include: DOCUMENT_INCLUDE,
  });
}

/**
 * 画面・Server Action が渡す会計文書の id（`CKK~ACC-…`・参照・番号だけ・旧番号）
 * → 参照。見つからない・番号だけで 2 つの法人に当たるときは null。
 */
async function accountingDocRef(
  documentNumber: string,
): Promise<string | null> {
  return toDocRef("accounting_documents", documentNumber).catch(() => null);
}

/** 請求書の連番（伝票番号の欄に出す）。番号 INV-FFFF-NNNNN の NNNNN。 */
function invoiceSlipNo(invoiceKey: DocKey): number | null {
  return docNumberParts(invoiceKey.docRef)?.seq ?? null;
}

function toSummary(row: DocumentRow): AccountingDocumentSummary {
  return {
    documentNumber: docIdOf(row),
    invoiceNumber: docIdOf(row.invoice),
    legacyNumber: row.legacyNumber,
    status: row.status,
    isReversal: row.reversalOfId != null,
    postingDate: row.postingDate.toISOString(),
    totalDebit: Number(row.totalDebit),
    postedAt: row.postedAt.toISOString(),
    postedByName: row.postedByUser?.displayName ?? null,
    reversedAt: row.reversedAt?.toISOString() ?? null,
    reversedByName: row.reversedByUser?.displayName ?? null,
    reverseReason: row.reverseReason,
  };
}

/** DB 行（Decimal 込み）→ `PersistedJournalLine`（純粋関数の境界）。 */
function toPersistedLine(
  line: DocumentRow["lines"][number],
): PersistedJournalLine {
  return {
    kind: line.kind,
    taxRate: Number(line.taxRate),
    debitAccountCode: line.debitAccountCode,
    debitSubCode: line.debitSubCode,
    debitDeptCode: line.debitDeptCode,
    debitTaxCode: line.debitTaxCode,
    debitAmount: Number(line.debitAmount),
    creditAccountCode: line.creditAccountCode,
    creditSubCode: line.creditSubCode,
    creditDeptCode: line.creditDeptCode,
    creditTaxCode: line.creditTaxCode,
    creditAmount: Number(line.creditAmount),
    memo: line.memo,
  };
}

/**
 * その請求書に「いま有効な転記」があれば返す（`POSTED` かつ反対仕訳文書
 * ではないもの — 部分 unique index と同じ条件）。無ければ `null`
 * （まだ 1 度も転記していない、または反対仕訳済みで未再転記）。
 */
export async function fetchActiveAccountingDocument(
  invoiceKey: DocKey,
): Promise<AccountingDocumentWithRows | null> {
  const row = await findDocumentRow({
    invoice: { docRef: invoiceKey.docRef },
    status: "POSTED",
    reversalOfId: null,
  });
  if (!row) return null;
  // CSV に出すのは番号（人と会計ソフトが読む姿）。
  const invoiceNumber = docNumberOf(invoiceKey);
  const party = await fetchInvoiceAccountingPartyByInvoiceRow(row);
  const rows = row.lines.map((line) =>
    lineToJournalRow(toPersistedLine(line), {
      date: row.postingDate,
      invoiceNumber,
      customerCode: party.customerCode ?? "",
      customerName: party.customerName,
      slipNo: String(invoiceSlipNo(invoiceKey) ?? ""),
    }),
  );
  return { ...toSummary(row), rows };
}

/** その請求書に紐づく全会計文書（元・反対仕訳・訂正後）を新しい順で。 */
export async function fetchAccountingDocumentHistory(
  invoiceKey: DocKey,
): Promise<AccountingDocumentSummary[]> {
  const rows = await prisma.accountingDocument.findMany({
    where: { invoice: { docRef: invoiceKey.docRef } },
    include: DOCUMENT_INCLUDE,
    orderBy: { postedAt: "desc" },
  });
  return rows.map(toSummary);
}

/**
 * 会計文書の id → 文書 1 件（一覧のリンク先に請求書番号が要るため）。
 * id（`CKK~ACC-…`）・参照・番号だけ・旧番号のどれでも受ける。
 */
export async function fetchAccountingDocumentByNumber(
  documentNumber: string,
): Promise<AccountingDocumentSummary | null> {
  const docRef = await accountingDocRef(documentNumber);
  if (!docRef) return null;
  const row = await findDocumentRow({ docRef });
  return row ? toSummary(row) : null;
}

/** 一覧（SY0J 文書履歴）— 全社の会計文書を新しい順で。 */
export async function fetchAccountingDocuments(
  status?: "POSTED" | "REVERSED",
): Promise<AccountingDocumentSummary[]> {
  const rows = await prisma.accountingDocument.findMany({
    where: status ? { status } : undefined,
    include: DOCUMENT_INCLUDE,
    orderBy: { postedAt: "desc" },
    take: 1000,
  });
  return rows.map(toSummary);
}

/** `fetchInvoiceAccountingParty` を文書行（元の請求書の参照）から呼ぶ薄いラッパ。 */
async function fetchInvoiceAccountingPartyByInvoiceRow(
  row: Pick<DocumentRow, "invoice">,
): Promise<{ customerCode: string | null; customerName: string }> {
  const invoice = await fetchInvoice({ docRef: row.invoice.docRef });
  const party = invoice
    ? await fetchInvoiceAccountingParty(invoice.customerBpId)
    : { customerCode: null };
  return {
    customerCode: party.customerCode,
    customerName: invoice?.customerName ?? "",
  };
}

/**
 * 転記（POST）— 請求書 1 件を仕訳として固定する。すでに有効な転記が
 * あるかどうかは呼び出し側（route.ts）が先に `fetchActiveAccountingDocument`
 * で確認していることを前提にする（ここでは確認しない — 呼び出し側の分岐と
 * 二重に持つと片方だけ直し忘れる）。
 */
export async function postAccountingDocument(
  invoiceKey: DocKey,
  actorId: string | null,
): Promise<ActionResult<AccountingDocumentWithRows>> {
  const invoice = await fetchInvoice(invoiceKey);
  if (!invoice)
    return actionError(`Invoice not found: ${docNumberOf(invoiceKey)}`);
  // 番号・旧番号・発行元は行から読む（画面の DTO の invoiceNumber は id の姿）。
  const invoiceRow = await prisma.invoice.findUnique({
    where: { docRef: invoiceKey.docRef },
    select: { id: true, ownCompanyId: true, legacyNumber: true },
  });
  if (!invoiceRow)
    return actionError(`Invoice not found: ${docNumberOf(invoiceKey)}`);
  const invoiceNumber = docNumberOf(invoiceKey);

  const settings = await getAccountingSettings();
  const party = await fetchInvoiceAccountingParty(invoice.customerBpId);
  const input = {
    invoiceNumber,
    // 振り直し前の番号（旧 INV-YYYYMM-NNNNN）。摘要に括弧で添える
    // （accounting-export-core buildJournalRows）。
    legacyInvoiceNumber: invoiceRow.legacyNumber,
    customerName: invoice.customerName,
    customerCode: party.customerCode,
    receivableAccountCode: party.receivableAccountCode,
    receivableSubAccountCode: party.receivableSubAccountCode,
    slipNo: invoiceSlipNo(invoiceKey),
    date: invoice.issuedAt ?? new Date(),
    totalAmount: invoice.totalAmount,
    taxAmount: invoice.taxAmount,
    taxLines: resolveTaxBuckets(invoice),
  };
  const conflicts = conflictingTaxRates(input);
  if (conflicts.length > 0) {
    return actionError(
      `Invoice ${invoiceNumber} has tax buckets whose account codes are ambiguous (rates: ${conflicts
        .map((r) => `${Number((r * 100).toFixed(4))}%`)
        .join(
          ", ",
        )}); set the same accounting codes on the tax categories that share each rate`,
    );
  }

  const rows = buildJournalRows(input, settings);
  const totalDebit = rows.reduce((sum, r) => sum + r.debit.amount, 0);
  const settingsRevision = await getAccountingSettingsRevision();
  const postingDate = invoice.issuedAt ?? new Date();

  let exportedClosingId: string | null = null;
  // 番号（ACC-FFFF-NNNNN）は INSERT のときに DB が払い出す — 作った行から読む。
  const created = await prisma.$transaction(async (tx) => {
    // 会計文書は請求書の発行元を継ぐ（lib/doc-company-core.ts）。
    const doc = await tx.accountingDocument.create({
      data: {
        invoiceId: invoiceRow.id,
        ownCompanyId: companyForAccountingDocument({
          invoiceCompanyId: invoiceRow.ownCompanyId,
        }),
        status: "POSTED",
        postingDate,
        settingsRevision,
        totalDebit,
        postedBy: actorId,
        lines: {
          create: rows.map((r, i) => ({
            kind: r.kind,
            taxRate: r.taxRate,
            debitAccountCode: r.debit.accountCode,
            debitSubCode: r.debit.subCode,
            debitDeptCode: r.debit.deptCode,
            debitTaxCode: r.debit.taxCode,
            debitAmount: r.debit.amount,
            creditAccountCode: r.credit.accountCode,
            creditSubCode: r.credit.subCode,
            creditDeptCode: r.credit.deptCode,
            creditTaxCode: r.credit.taxCode,
            creditAmount: r.credit.amount,
            memo: r.memo,
            sortOrder: i,
          })),
        },
      },
      select: { docRef: true },
    });
    await tx.invoice.update({
      where: { id: invoiceRow.id },
      data: { accountingExportedAt: new Date() },
    });
    // 締日 PROCESSED → EXPORTED（既存の route.ts の遷移をそのまま移植）。
    const closing = await tx.billingClosing.findFirst({
      where: { invoiceId: invoiceRow.id, status: "PROCESSED" },
      select: { id: true },
    });
    if (closing) {
      const updated = await tx.billingClosing.updateMany({
        where: { id: closing.id, status: "PROCESSED" },
        data: { status: "EXPORTED" },
      });
      if (updated.count === 1) exportedClosingId = closing.id;
    }
    return doc;
  });
  const documentNumber = docNumberOf(created);

  await recordAudit({
    action: "CREATE",
    tableName: "accounting_documents",
    recordId: created.docRef,
    after: {
      invoiceNumber,
      totalDebit,
      settingsRevision,
      lineCount: rows.length,
    },
  });
  if (exportedClosingId) {
    await recordAudit({
      action: "UPDATE",
      tableName: "billing_closings",
      recordId: exportedClosingId,
      before: { status: "PROCESSED" },
      after: { status: "EXPORTED", invoiceNumber },
    });
  }

  const posted = await fetchActiveAccountingDocument(invoiceKey);
  if (!posted) {
    return actionError(
      `Posting ${documentNumber} succeeded but could not be re-read`,
    );
  }
  return actionOk(posted);
}

/**
 * 反対仕訳（REVERSE）— 貸借を入れ替えた新しい文書を作り、元の文書は
 * `REVERSED` に変わるだけで明細は変更しない（SAP FB08 と同じ形）。
 * 権限チェックは呼び出し側（`billing/invoices/actions.ts`）の責務。
 */
export async function reverseAccountingDocumentCore(
  documentNumber: string,
  reason: string,
  actorId: string | null,
): Promise<ActionResult<{ documentNumber: string }>> {
  const tr = await getTranslations();
  const docRef = await accountingDocRef(documentNumber);
  if (!docRef) {
    return actionError(tr("billing.accountingDocuments.invalidDocumentNumber"));
  }
  if (!reason.trim()) {
    return actionError(tr("billing.accountingDocuments.reasonRequired"));
  }

  const original = await findDocumentRow({
    docRef,
    status: "POSTED",
    reversalOfId: null,
  });
  if (!original) {
    return actionError(tr("billing.accountingDocuments.notActivePosted"));
  }

  // 反対仕訳の番号も INSERT のときに DB が払い出す。
  const reversal = await prisma.$transaction(async (tx) => {
    const doc = await tx.accountingDocument.create({
      data: {
        invoiceId: original.invoiceId,
        // 反対仕訳は元の文書と同じ法人（= 同じ請求書の発行元）。
        ownCompanyId: original.ownCompanyId,
        status: "POSTED",
        postingDate: original.postingDate,
        settingsRevision: original.settingsRevision,
        totalDebit: original.totalDebit,
        reversalOfId: original.id,
        postedBy: actorId,
        lines: {
          // 貸借を入れ替える（負仕訳ではなく借方欄/貸方欄そのものをスワップ）。
          create: original.lines.map((l) => ({
            kind: l.kind,
            taxRate: l.taxRate,
            debitAccountCode: l.creditAccountCode,
            debitSubCode: l.creditSubCode,
            debitDeptCode: l.creditDeptCode,
            debitTaxCode: l.creditTaxCode,
            debitAmount: l.creditAmount,
            creditAccountCode: l.debitAccountCode,
            creditSubCode: l.debitSubCode,
            creditDeptCode: l.debitDeptCode,
            creditTaxCode: l.debitTaxCode,
            creditAmount: l.debitAmount,
            memo: l.memo,
            sortOrder: l.sortOrder,
          })),
        },
      },
      select: { docRef: true },
    });
    await tx.accountingDocument.update({
      where: { id: original.id },
      data: {
        status: "REVERSED",
        reversedBy: actorId,
        reversedAt: new Date(),
        reverseReason: reason,
      },
    });
    return doc;
  });
  const reversalNumber = docNumberOf(reversal);

  await recordAudit({
    action: "UPDATE",
    tableName: "accounting_documents",
    recordId: original.docRef,
    before: { status: "POSTED" },
    after: {
      status: "REVERSED",
      reverseReason: reason,
      reversalDocument: reversalNumber,
    },
  });
  await recordAudit({
    action: "CREATE",
    tableName: "accounting_documents",
    recordId: reversal.docRef,
    after: {
      reversalOf: docNumberOf(original),
      totalDebit: Number(original.totalDebit),
    },
  });

  // 画面へ返すのは id の姿（リンクにそのまま使える）。
  return actionOk({ documentNumber: docIdOf(reversal) });
}
