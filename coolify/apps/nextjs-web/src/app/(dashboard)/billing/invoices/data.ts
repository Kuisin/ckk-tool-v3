/**
 * data.ts — 請求書 (BL01) ページのサーバーサイド取得・マッピング。
 *
 * app.invoices は (year_month, seq) の複合キー — 表示番号 INV-YYYYMM-NNNNN は
 * 導出（保存しない）で、URL id を兼ねる。明細（invoice_items）は由来として
 * 出荷書 / 納品書の複合キーを持ち、画面では導出番号のリンクとして表示する。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 */

import { ownWhere, rowInScope } from "@ckk/authz-core";
import type {
  Invoice,
  InvoiceItem,
  InvoiceLink,
  InvoiceStatus,
} from "@/components/billing/invoices/model";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import { type DocKey, formatDocNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

// 一覧クエリの取得上限（監査 P2-8 — 全件フェッチのデータ増加対策）。
// DataTable はクライアントページングのため、最新分のみで実用上十分。
const LIST_FETCH_CAP = 1000;

const INVOICE_INCLUDE = {
  // customerAttrs.taxType は消費税ラベル（10% / 8% / 非課税）の表示に使う。
  customerBp: { include: { customerAttrs: true } },
  customerBranchBp: true,
  salesRep: { select: { id: true, displayName: true } },
  createdByUser: { select: { displayName: true } },
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
  prefix: "DOR" | "DRN",
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
    deliveryOrderNumber: provenanceNumber(
      "DOR",
      it.deliveryOrderYearMonth,
      it.deliveryOrderSeq,
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
    recipientDocumentLocale:
      r.customerBranchBp?.documentLocale ?? r.customerBp.documentLocale ?? null,
    salesRepId: r.salesRep?.id ?? null,
    salesRepName: r.salesRep?.displayName ?? null,
    createdByName: r.createdByUser?.displayName ?? null,
    billingPeriodFrom: r.billingPeriodFrom.toISOString(),
    billingPeriodTo: r.billingPeriodTo.toISOString(),
    subtotal: Number(r.subtotal),
    taxAmount: Number(r.taxAmount),
    taxType: r.customerBp.customerAttrs?.taxType ?? null,
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

/**
 * 一覧 — 新しい採番から順に。
 *
 * スコープ（監査 M3）: 請求書に拠点は無いので OWN（自分が起票した分）だけを
 * 見る。ALL は {} で従来どおり全件。見積書（sales/quotes/data.ts）と同じ形。
 */
export async function fetchInvoices(): Promise<Invoice[]> {
  const authz = await checkPermission("invoice", "READ");
  if (!authz.ok) return [];
  const rows = await prisma.invoice.findMany({
    take: LIST_FETCH_CAP,
    where: ownWhere(
      authz.access,
      authz.userId,
      "createdBy",
    ) as Prisma.InvoiceWhereInput,
    include: INVOICE_INCLUDE,
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
  });
  return rows.map(mapInvoice);
}

/** 1件取得 — 未存在・スコープ外は null（呼び出し側の notFound / 404 に乗せる）。 */
export async function fetchInvoice(key: DocKey): Promise<Invoice | null> {
  const authz = await checkPermission("invoice", "READ");
  if (!authz.ok) return null;
  const row = await findRow(key);
  if (!row) return null;
  if (!rowInScope(authz.access, { createdBy: row.createdBy }, authz.userId)) {
    return null;
  }
  return mapInvoice(row);
}

/**
 * 逆リンク — その納品書を請求した請求書（新しい採番順）。
 *
 * 明細（invoice_items）が由来の納品書キーを持つので、そこから逆に引く。
 * 1 納品書が複数の請求書に載ることは通常ないが、訂正再発行があり得るため配列。
 */
export async function fetchInvoicesForDeliveryNote(
  key: DocKey,
): Promise<InvoiceLink[]> {
  const rows = await prisma.invoice.findMany({
    where: {
      items: {
        some: {
          deliveryNoteYearMonth: key.yearMonth,
          deliveryNoteSeq: key.seq,
        },
      },
    },
    select: {
      yearMonth: true,
      seq: true,
      status: true,
      totalAmount: true,
      issuedAt: true,
    },
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
    take: 20,
  });
  return rows.map((r) => ({
    number: formatDocNumber("INV", { yearMonth: r.yearMonth, seq: r.seq }),
    status: r.status as InvoiceStatus,
    totalAmount: Number(r.totalAmount),
    issuedAt: r.issuedAt?.toISOString() ?? null,
  }));
}
