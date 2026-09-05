/**
 * data.ts — 締日処理 (BL02) のサーバーサイド取得・請求対象出荷の収集。
 *
 * 請求対象 = SHIPPED × DISPATCH の出荷書のうち「未請求」のもの。
 * 未請求判定は invoice_items の由来キー（delivery_order_year_month/seq）に
 * その出荷書が現れないこと（STOCK_STORAGE は請求フロー外なので対象外）。
 * 請求期間は顧客ごとに **(前回締日, 今回締日]**（境界は JST 0 時 —
 * model.ts billingWindowFor）。暦月で切ると締日より後の出荷がどの締めにも
 * 入らず請求されない。
 * runClosing / processClosing (actions.ts) と詳細画面がここを共用する。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 */

import {
  addDays,
  type BillingClosing,
  type BillingClosingDetail,
  billingPeriodStart,
  billingWindowFor,
  type ClosingShipmentRow,
  type ClosingStatus,
  inBillingWindow,
  jstMidnightOf,
} from "@/components/billing/closings/model";
import { prisma } from "@/lib/db";
import { formatDocNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { lineAmountYen } from "@/lib/money";

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
  // 顧客はヘッダが権威。単価は明細行が参照する注文明細ごとに異なり得る。
  customerBp: { include: { customerAttrs: true } },
  items: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      product: true,
      // acceptance は営業担当の導出用（出荷書は担当を保存しない）。
      orderLine: {
        include: { acceptance: { select: { salesRepId: true } } },
      },
    },
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
    prisma.deliveryOrder.findMany({
      where: {
        type: "DISPATCH",
        status: "SHIPPED",
        shippedAt: { gte: range.gte, lt: range.lt },
      },
      include: SHIPMENT_INCLUDE,
      orderBy: [{ yearMonth: "asc" }, { seq: "asc" }],
    }),
    prisma.invoiceItem.findMany({
      where: { deliveryOrderYearMonth: { not: null } },
      select: { deliveryOrderYearMonth: true, deliveryOrderSeq: true },
    }),
  ]);
  const invoicedSet = new Set(
    invoiced.map((r) => `${r.deliveryOrderYearMonth}-${r.deliveryOrderSeq}`),
  );
  return rows.filter((r) => !invoicedSet.has(`${r.yearMonth}-${r.seq}`));
}

/**
 * 顧客 × 締日の請求対象出荷 — (前回締日, 締日]（JST）。processClosing と共用。
 * 前回締日は顧客の締日設定（BpCustomerAttrs.closingDay）から引く。上限は
 * この締日行の closingDate そのもの（設定が後から変わっても行の締日は動かない）。
 */
export async function fetchBillableShipmentsForClosing(
  customerBpId: string,
  closingDate: Date,
): Promise<BillableShipment[]> {
  const attrs = await prisma.bpCustomerAttrs.findUnique({
    where: { bpId: customerBpId },
    select: { closingDay: true },
  });
  const year = closingDate.getUTCFullYear();
  const month = closingDate.getUTCMonth() + 1;
  const gte = jstMidnightOf(
    billingPeriodStart(year, month, attrs?.closingDay ?? null),
  );
  const lt = jstMidnightOf(addDays(closingDate, 1)); // 締日当日を含む（排他的上限）
  const rows = await fetchUninvoicedShipments({ gte, lt });
  return rows.filter((r) => r.customerBpId === customerBpId);
}

/**
 * 出荷書 1 件の請求金額 = Σ（明細数量 × **その行の**注文明細の単価）。
 * 1 出荷書が単価の異なる複数の注文明細を束ねられるので、出荷書単位の
 * 単一単価では誤請求になる。
 */
export function shipmentAmount(s: BillableShipment): number {
  // 行ごとに円へ丸めてから足す（lib/money.ts の方針）— 締日処理が作る請求書の
  // 明細と同じ丸め方なので、締日画面の予定額と発行後の請求額がずれない。
  return s.items.reduce(
    (sum, it) =>
      sum + lineAmountYen(Number(it.orderLine?.unitPrice ?? 0), it.quantity),
    0,
  );
}

function mapShipmentRow(s: BillableShipment): ClosingShipmentRow {
  return {
    deliveryOrderNumber: formatDocNumber("DOR", {
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
    if (!it.deliveryOrderYearMonth || it.deliveryOrderSeq == null) continue;
    const key = `${it.deliveryOrderYearMonth}-${it.deliveryOrderSeq}`;
    const cur = byKey.get(key) ?? {
      yearMonth: it.deliveryOrderYearMonth,
      seq: it.deliveryOrderSeq,
      quantity: 0,
      amount: 0,
    };
    cur.quantity += it.quantity;
    cur.amount += Number(it.amount);
    byKey.set(key, cur);
  }
  const keys = [...byKey.values()];
  if (keys.length === 0) return [];
  const orders = await prisma.deliveryOrder.findMany({
    where: {
      OR: keys.map((k) => ({ yearMonth: k.yearMonth, seq: k.seq })),
    },
    select: { yearMonth: true, seq: true, shippedAt: true },
  });
  const shippedAtByKey = new Map(
    orders.map((o) => [`${o.yearMonth}-${o.seq}`, o.shippedAt]),
  );
  return keys.map((k) => ({
    deliveryOrderNumber: formatDocNumber("DOR", {
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
 * 既定 = 月末）と合計金額を確定する。顧客の請求期間は (前回締日, 今回締日]
 * — 締日より後の出荷は翌月の締めに入る（billingWindowFor）。
 */
export async function collectClosingCandidates(
  year: number,
  month: number,
): Promise<CustomerClosingCandidate[]> {
  // 全顧客の請求期間の和集合を 1 回で引く: 最も早い前回締日（1 日）の翌日 〜
  // 最も遅い締日（月末）の翌日。顧客ごとの絞り込みは下のループで行う。
  const gte = jstMidnightOf(billingPeriodStart(year, month, 1));
  const { lt } = billingWindowFor(year, month, 31);
  const shipments = await fetchUninvoicedShipments({ gte, lt });

  const byCustomer = new Map<string, CustomerClosingCandidate>();
  for (const s of shipments) {
    const customer = s.customerBp;
    const window = billingWindowFor(
      year,
      month,
      customer.customerAttrs?.closingDay ?? null,
    );
    // 前回締日以前（前回の締め）・締日より後（翌月の締め）は今回に含めない。
    if (!s.shippedAt || !inBillingWindow(s.shippedAt, window)) continue;
    const closingDate = window.closingDate;

    const cur = byCustomer.get(customer.id) ?? {
      customerBpId: customer.id,
      customerName: localized(customer.name as LocalizedText | null),
      closingDate,
      totalAmount: 0,
      shipmentNumbers: [],
    };
    cur.totalAmount += shipmentAmount(s);
    cur.shipmentNumbers.push(
      formatDocNumber("DOR", { yearMonth: s.yearMonth, seq: s.seq }),
    );
    byCustomer.set(customer.id, cur);
  }
  return [...byCustomer.values()];
}
