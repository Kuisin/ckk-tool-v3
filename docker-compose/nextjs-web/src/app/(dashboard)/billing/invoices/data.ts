/**
 * data.ts — 請求書 (BL01) ページのサーバーサイド取得・マッピング。
 *
 * app.invoices は (year_month, seq) の複合キー — 表示番号 INV-YYYYMM-NNNNN は
 * 導出（保存しない）で、URL id を兼ねる。明細（invoice_items）は由来として
 * 出荷書 / 納品書の複合キーを持ち、画面では導出番号のリンクとして表示する。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 */

import type {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
} from "@/components/billing/invoices/model";
import { prisma } from "@/lib/db";
import { type DocKey, formatDocNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

// 一覧クエリの取得上限（監査 P2-8 — 全件フェッチのデータ増加対策）。
// DataTable はクライアントページングのため、最新分のみで実用上十分。
const LIST_FETCH_CAP = 1000;

const INVOICE_INCLUDE = {
  customerBp: true,
  customerBranchBp: true,
  items: { orderBy: { sortOrder: "asc" as const } },
};

type InvoiceRow = NonNullable<Awaited<ReturnType<typeof findRow>>>;

function findRow(key: DocKey) {
  return prisma.invoice.findUnique({
    where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
    include: INVOICE_INCLUDE,
  });
}

/** 由来キー（nullable ペア）→ 導出文書番号。片方でも欠ければ null。 */
function provenanceNumber(
  prefix: "SHP" | "DRN",
  yearMonth: string | null,
  seq: number | null,
): string | null {
  if (!yearMonth || seq == null) return null;
  return formatDocNumber(prefix, { yearMonth, seq });
}

function mapInvoice(r: InvoiceRow): Invoice {
  const number = formatDocNumber("INV", { yearMonth: r.yearMonth, seq: r.seq });
  const items: InvoiceItem[] = r.items.map((it) => ({
    id: it.id,
    description: localized(it.description as LocalizedText | null),
    quantity: it.quantity,
    unitPrice: Number(it.unitPrice),
    amount: Number(it.amount),
    shippingOrderNumber: provenanceNumber(
      "SHP",
      it.shippingOrderYearMonth,
      it.shippingOrderSeq,
    ),
    deliveryNoteNumber: provenanceNumber(
      "DRN",
      it.deliveryNoteYearMonth,
      it.deliveryNoteSeq,
    ),
  }));
  return {
    id: number,
    invoiceNumber: number,
    customerBpId: r.customerBpId,
    customerName: localized(r.customerBp.name as LocalizedText | null),
    customerBranchName: r.customerBranchBp
      ? localized(r.customerBranchBp.name as LocalizedText | null)
      : null,
    billingPeriodFrom: r.billingPeriodFrom.toISOString(),
    billingPeriodTo: r.billingPeriodTo.toISOString(),
    subtotal: Number(r.subtotal),
    taxAmount: Number(r.taxAmount),
    totalAmount: Number(r.totalAmount),
    status: r.status as InvoiceStatus,
    issuedAt: r.issuedAt?.toISOString() ?? null,
    dueDate: r.dueDate?.toISOString() ?? null,
    sentAt: r.sentAt?.toISOString() ?? null,
    yayoiExportedAt: r.yayoiExportedAt?.toISOString() ?? null,
    notes: r.notes,
    items,
    totalQuantity: items.reduce((sum, it) => sum + it.quantity, 0),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** 一覧 — 新しい採番から順に。 */
export async function fetchInvoices(): Promise<Invoice[]> {
  const rows = await prisma.invoice.findMany({
    take: LIST_FETCH_CAP,
    include: INVOICE_INCLUDE,
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
  });
  return rows.map(mapInvoice);
}

/** 1件取得 — 未存在は null。 */
export async function fetchInvoice(key: DocKey): Promise<Invoice | null> {
  const row = await findRow(key);
  return row ? mapInvoice(row) : null;
}
