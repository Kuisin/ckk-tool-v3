/**
 * data.ts — 締日処理 (BL02) のサーバーサイド取得・請求対象出荷の収集。
 *
 * 請求対象 = SHIPPED × DISPATCH の出荷書のうち「未請求」のもの。
 * 未請求判定は invoice_items の由来キー（shipping_order_year_month/seq）に
 * その出荷書が現れないこと（STOCK_STORAGE は請求フロー外なので対象外）。
 * runClosing / processClosing (actions.ts) と詳細画面がここを共用する。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 */

import {
  addDays,
  type BillingClosing,
  type BillingClosingDetail,
  type ClosingShipmentRow,
  type ClosingStatus,
  closingDateFor,
} from "@/components/billing/closings/model";
import { prisma } from "@/lib/db";
import { formatDocNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

// ── 締日処理行のマッピング ───────────────────────────────────────────────────

const CLOSING_INCLUDE = { customerBp: true };

type ClosingRow = NonNullable<Awaited<ReturnType<typeof findClosingRow>>>;

function findClosingRow(id: string) {
  return prisma.billingClosing.findUnique({
    where: { id },
    include: CLOSING_INCLUDE,
  });
}

function mapClosing(r: ClosingRow): BillingClosing {
  return {
    id: r.id,
    customerBpId: r.customerBpId,
    customerName: localized(r.customerBp.name as LocalizedText | null),
    closingDate: r.closingDate.toISOString(),
    status: r.status as ClosingStatus,
    totalAmount: r.totalAmount != null ? Number(r.totalAmount) : null,
    invoiceNumber:
      r.invoiceYearMonth && r.invoiceSeq != null
        ? formatDocNumber("INV", {
            yearMonth: r.invoiceYearMonth,
            seq: r.invoiceSeq,
          })
        : null,
    processedAt: r.processedAt?.toISOString() ?? null,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  };
}

/** 一覧 — 締日の新しい順。 */
export async function fetchClosings(): Promise<BillingClosing[]> {
  const rows = await prisma.billingClosing.findMany({
    include: CLOSING_INCLUDE,
    orderBy: [{ closingDate: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(mapClosing);
}

// ── 請求対象出荷（SHIPPED × DISPATCH × 未請求）の収集 ────────────────────────

const SHIPMENT_INCLUDE = {
  salesOrder: {
    include: { customerBp: { include: { customerAttrs: true } } },
  },
  items: {
    orderBy: { sortOrder: "asc" as const },
    include: { product: true },
  },
  deliveryNotes: {
    select: { yearMonth: true, seq: true },
    orderBy: [{ yearMonth: "asc" as const }, { seq: "asc" as const }],
  },
};

export type BillableShipment = Awaited<
  ReturnType<typeof fetchUninvoicedShipments>
>[number];

/**
 * 期間内（shippedAt: gte ≤ t < lt）の SHIPPED × DISPATCH 出荷書のうち、
 * まだどの請求書明細にも由来として現れていないもの。
 */
export async function fetchUninvoicedShipments(range: { gte: Date; lt: Date }) {
  const [rows, invoiced] = await Promise.all([
    prisma.shippingOrder.findMany({
      where: {
        type: "DISPATCH",
        status: "SHIPPED",
        shippedAt: { gte: range.gte, lt: range.lt },
      },
      include: SHIPMENT_INCLUDE,
      orderBy: [{ yearMonth: "asc" }, { seq: "asc" }],
    }),
    prisma.invoiceItem.findMany({
      where: { shippingOrderYearMonth: { not: null } },
      select: { shippingOrderYearMonth: true, shippingOrderSeq: true },
    }),
  ]);
  const invoicedSet = new Set(
    invoiced.map((r) => `${r.shippingOrderYearMonth}-${r.shippingOrderSeq}`),
  );
  return rows.filter((r) => !invoicedSet.has(`${r.yearMonth}-${r.seq}`));
}

/** 顧客 × 締日の請求対象出荷 — 月初〜締日（両端含む）。processClosing と共用。 */
export async function fetchBillableShipmentsForClosing(
  customerBpId: string,
  closingDate: Date,
): Promise<BillableShipment[]> {
  const year = closingDate.getUTCFullYear();
  const month = closingDate.getUTCMonth() + 1;
  const gte = new Date(Date.UTC(year, month - 1, 1));
  const lt = addDays(closingDate, 1); // 締日当日を含む（排他的上限）
  const rows = await fetchUninvoicedShipments({ gte, lt });
  return rows.filter((r) => r.salesOrder.customerBpId === customerBpId);
}

/** 出荷書 1 件の請求金額 = Σ 明細数量 × 注文請書の単価。 */
export function shipmentAmount(s: BillableShipment): number {
  const unitPrice = Number(s.salesOrder.unitPrice);
  return s.items.reduce((sum, it) => sum + it.quantity * unitPrice, 0);
}

function mapShipmentRow(s: BillableShipment): ClosingShipmentRow {
  return {
    shippingOrderNumber: formatDocNumber("SHP", {
      yearMonth: s.yearMonth,
      seq: s.seq,
    }),
    shippedAt: s.shippedAt?.toISOString() ?? null,
    quantity: s.items.reduce((sum, it) => sum + it.quantity, 0),
    amount: shipmentAmount(s),
  };
}

// ── 詳細（対象出荷リスト込み） ───────────────────────────────────────────────

/** 処理済み締日の対象出荷 — 生成請求書の明細由来から復元する。 */
async function fetchShipmentsFromInvoice(
  invoiceYearMonth: string,
  invoiceSeq: number,
): Promise<ClosingShipmentRow[]> {
  const items = await prisma.invoiceItem.findMany({
    where: { invoiceYearMonth, invoiceSeq },
    orderBy: { sortOrder: "asc" },
  });
  // 出荷書キーごとに数量・金額を集計する。
  const byKey = new Map<
    string,
    { yearMonth: string; seq: number; quantity: number; amount: number }
  >();
  for (const it of items) {
    if (!it.shippingOrderYearMonth || it.shippingOrderSeq == null) continue;
    const key = `${it.shippingOrderYearMonth}-${it.shippingOrderSeq}`;
    const cur = byKey.get(key) ?? {
      yearMonth: it.shippingOrderYearMonth,
      seq: it.shippingOrderSeq,
      quantity: 0,
      amount: 0,
    };
    cur.quantity += it.quantity;
    cur.amount += Number(it.amount);
    byKey.set(key, cur);
  }
  const keys = [...byKey.values()];
  if (keys.length === 0) return [];
  const orders = await prisma.shippingOrder.findMany({
    where: {
      OR: keys.map((k) => ({ yearMonth: k.yearMonth, seq: k.seq })),
    },
    select: { yearMonth: true, seq: true, shippedAt: true },
  });
  const shippedAtByKey = new Map(
    orders.map((o) => [`${o.yearMonth}-${o.seq}`, o.shippedAt]),
  );
  return keys.map((k) => ({
    shippingOrderNumber: formatDocNumber("SHP", {
      yearMonth: k.yearMonth,
      seq: k.seq,
    }),
    shippedAt:
      shippedAtByKey.get(`${k.yearMonth}-${k.seq}`)?.toISOString() ?? null,
    quantity: k.quantity,
    amount: k.amount,
  }));
}

/** 1件取得（詳細）— 未存在は null。 */
export async function fetchClosing(
  id: string,
): Promise<BillingClosingDetail | null> {
  const row = await findClosingRow(id);
  if (!row) return null;
  const closing = mapClosing(row);

  // PENDING: 未請求候補を計算 / PROCESSED・EXPORTED: 請求書の由来から復元。
  const shipments =
    row.status === "PENDING"
      ? (
          await fetchBillableShipmentsForClosing(
            row.customerBpId,
            row.closingDate,
          )
        ).map(mapShipmentRow)
      : row.invoiceYearMonth && row.invoiceSeq != null
        ? await fetchShipmentsFromInvoice(row.invoiceYearMonth, row.invoiceSeq)
        : [];

  return { ...closing, shipments };
}

// ── runClosing 用: 顧客ごとの締日確定 ────────────────────────────────────────

export interface CustomerClosingCandidate {
  customerBpId: string;
  customerName: string;
  closingDate: Date;
  totalAmount: number;
  shipmentNumbers: string[];
}

/**
 * 対象月の未請求出荷を顧客ごとにまとめ、締日（BpCustomerAttrs.closingDay、
 * 既定 = 月末）と合計金額を確定する。締日より後に出荷された分は翌月扱いで除外。
 */
export async function collectClosingCandidates(
  year: number,
  month: number,
): Promise<CustomerClosingCandidate[]> {
  const gte = new Date(Date.UTC(year, month - 1, 1));
  const lt = new Date(Date.UTC(year, month, 1));
  const shipments = await fetchUninvoicedShipments({ gte, lt });

  const byCustomer = new Map<string, CustomerClosingCandidate>();
  for (const s of shipments) {
    const customer = s.salesOrder.customerBp;
    const closingDate = closingDateFor(
      year,
      month,
      customer.customerAttrs?.closingDay ?? null,
    );
    // 締日より後の出荷は今回の締めに含めない（翌月分）。
    if (s.shippedAt && s.shippedAt >= addDays(closingDate, 1)) continue;

    const cur = byCustomer.get(customer.id) ?? {
      customerBpId: customer.id,
      customerName: localized(customer.name as LocalizedText | null),
      closingDate,
      totalAmount: 0,
      shipmentNumbers: [],
    };
    cur.totalAmount += shipmentAmount(s);
    cur.shipmentNumbers.push(
      formatDocNumber("SHP", { yearMonth: s.yearMonth, seq: s.seq }),
    );
    byCustomer.set(customer.id, cur);
  }
  return [...byCustomer.values()];
}
