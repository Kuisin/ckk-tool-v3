/**
 * data.ts — 注文請書 (PD01) ページのサーバーサイド取得・マッピング。
 *
 * app.sales_orders は (year_month, seq, branch) の複合キー — 表示番号
 * ORD-YYYYMM-NNNNN-NN は導出（保存しない）で、URL id を兼ねる。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 */

import type {
  SalesOrder,
  SalesOrderStatus,
} from "@/components/production/sales-orders/model";
import { prisma } from "@/lib/db";
import {
  formatProductNumber,
  formatQuoteNumber,
  formatSalesOrderNumber,
  type SalesOrderKey,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

// 一覧クエリの取得上限（監査 P2-8 — 全件フェッチのデータ増加対策）。
// DataTable はクライアントページングのため、最新分のみで実用上十分。
const LIST_FETCH_CAP = 1000;

const SALES_ORDER_INCLUDE = {
  customerBp: true,
  customerBranchBp: true,
  endUserBp: true,
  product: true,
  workOrders: {
    orderBy: { workOrderNumber: "asc" as const },
  },
  // §4 在庫照合の引当済みサマリ用（予約中のみ — 確定/解除は数えない）。
  reservations: {
    where: { status: "RESERVED" as const },
    select: { quantity: true },
  },
};

type SalesOrderRow = NonNullable<Awaited<ReturnType<typeof findRow>>>;

function findRow(key: SalesOrderKey) {
  return prisma.salesOrder.findUnique({
    where: {
      yearMonth_seq_branch: {
        yearMonth: key.yearMonth,
        seq: key.seq,
        branch: key.branch,
      },
    },
    include: SALES_ORDER_INCLUDE,
  });
}

/** 製品ラベル: 名称 + 製品コード（レガシーはコード未採番 → 名称のみ）。 */
function productLabel(p: {
  name: unknown;
  yearMonth: string | null;
  seq: number | null;
}): string {
  const code = formatProductNumber(p.yearMonth, p.seq);
  const name = localized(p.name as LocalizedText | null);
  return code ? `${name} ${code}` : name;
}

function mapSalesOrder(r: SalesOrderRow): SalesOrder {
  const number = formatSalesOrderNumber({
    yearMonth: r.yearMonth,
    seq: r.seq,
    branch: r.branch,
  });
  return {
    id: number,
    orderNumber: number,
    uuid: r.id,
    customerId: r.customerBpId,
    customerName: localized(r.customerBp.name as LocalizedText | null),
    customerBranchId: r.customerBranchBpId,
    customerBranchName: r.customerBranchBp
      ? localized(r.customerBranchBp.name as LocalizedText | null)
      : null,
    endUserName: r.endUserBp
      ? localized(r.endUserBp.name as LocalizedText | null)
      : null,
    customerOrderRef: r.customerOrderRef,
    quoteNumber:
      r.quoteYearMonth && r.quoteSeq != null
        ? formatQuoteNumber({ yearMonth: r.quoteYearMonth, seq: r.quoteSeq })
        : null,
    productId: String(r.productId),
    productName: productLabel(r.product),
    orderType: r.orderType,
    quantity: r.quantity,
    unitPrice: Number(r.unitPrice),
    amount: Number(r.amount),
    deliveryDate: r.deliveryDate?.toISOString().slice(0, 10) ?? null,
    lotNumber: r.lotNumber,
    status: r.status as SalesOrderStatus,
    isLocked: r.isLocked,
    // 引当済み数 = この注文請書の予約中（RESERVED）予約の合計。
    reservedStockQuantity: r.reservations.reduce(
      (sum, rv) => sum + Number(rv.quantity),
      0,
    ),
    notes: r.notes,
    workOrders: r.workOrders.map((w) => ({
      workOrderNumber: w.workOrderNumber,
      type: w.type,
      plannedQuantity: w.plannedQuantity,
      approvalStatus: w.approvalStatus,
      status: w.status,
    })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** 一覧 — 新しい採番から順に。 */
export async function fetchSalesOrders(): Promise<SalesOrder[]> {
  const rows = await prisma.salesOrder.findMany({
    take: LIST_FETCH_CAP,
    include: SALES_ORDER_INCLUDE,
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }, { branch: "asc" }],
  });
  return rows.map(mapSalesOrder);
}

/** 1件取得 — キー不一致・未存在は null。 */
export async function fetchSalesOrder(
  key: SalesOrderKey,
): Promise<SalesOrder | null> {
  const row = await findRow(key);
  return row ? mapSalesOrder(row) : null;
}
