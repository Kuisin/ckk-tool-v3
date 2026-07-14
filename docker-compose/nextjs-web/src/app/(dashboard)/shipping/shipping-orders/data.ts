/**
 * data.ts — 出荷書 (SH01) ページのサーバーサイド取得・マッピング。
 *
 * app.shipping_orders は (year_month, seq) の複合キー — 表示番号
 * SHP-YYYYMM-NNNNN は導出（保存しない）で、URL id を兼ねる。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 */

import type {
  ShippingOrder,
  ShippingOrderStatus,
  ShippingType,
} from "@/components/shipping/shipping-orders/model";
import { prisma } from "@/lib/db";
import {
  type DocKey,
  formatDocNumber,
  formatProductNumber,
  formatSalesOrderNumber,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

const SHIPPING_ORDER_INCLUDE = {
  salesOrder: {
    include: {
      customerBp: true,
      customerBranchBp: true,
      product: true,
    },
  },
  workOrder: true,
  fromFactory: true,
  items: {
    orderBy: { sortOrder: "asc" as const },
    include: { product: true },
  },
  deliveryNotes: {
    orderBy: [{ yearMonth: "asc" as const }, { seq: "asc" as const }],
    include: { recipientBp: true },
  },
};

type ShippingOrderRow = NonNullable<Awaited<ReturnType<typeof findRow>>>;

function findRow(key: DocKey) {
  return prisma.shippingOrder.findUnique({
    where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
    include: SHIPPING_ORDER_INCLUDE,
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

function mapShippingOrder(r: ShippingOrderRow): ShippingOrder {
  const number = formatDocNumber("SHP", {
    yearMonth: r.yearMonth,
    seq: r.seq,
  });
  return {
    id: number,
    shippingNumber: number,
    salesOrderId: r.salesOrderId,
    salesOrderNumber: formatSalesOrderNumber(r.salesOrder),
    customerName: localized(
      r.salesOrder.customerBp.name as LocalizedText | null,
    ),
    customerBranchName: r.salesOrder.customerBranchBp
      ? localized(r.salesOrder.customerBranchBp.name as LocalizedText | null)
      : null,
    productName: productLabel(r.salesOrder.product),
    salesOrderQuantity: r.salesOrder.quantity,
    workOrderNumber: r.workOrder?.workOrderNumber ?? null,
    fromFactoryId: r.fromFactoryId != null ? String(r.fromFactoryId) : null,
    fromFactoryName: r.fromFactory
      ? localized(r.fromFactory.name as LocalizedText | null)
      : null,
    type: r.type as ShippingType,
    status: r.status as ShippingOrderStatus,
    shippedAt: r.shippedAt?.toISOString() ?? null,
    notes: r.notes,
    items: r.items.map((it) => ({
      id: it.id,
      productId: String(it.productId),
      productName: productLabel(it.product),
      lotNumber: it.lotNumber,
      quantity: it.quantity,
      notes: it.notes,
    })),
    totalQuantity: r.items.reduce((sum, it) => sum + it.quantity, 0),
    deliveryNotes: r.deliveryNotes.map((dn) => ({
      deliveryNumber: formatDocNumber("DRN", {
        yearMonth: dn.yearMonth,
        seq: dn.seq,
      }),
      deliveryMethod: dn.deliveryMethod,
      recipientName: localized(dn.recipientBp.name as LocalizedText | null),
      status: dn.status,
      deliveredAt: dn.deliveredAt?.toISOString() ?? null,
    })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** 一覧 — 新しい採番から順に。 */
export async function fetchShippingOrders(): Promise<ShippingOrder[]> {
  const rows = await prisma.shippingOrder.findMany({
    include: SHIPPING_ORDER_INCLUDE,
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
  });
  return rows.map(mapShippingOrder);
}

/** 1件取得 — 未存在は null。 */
export async function fetchShippingOrder(
  key: DocKey,
): Promise<ShippingOrder | null> {
  const row = await findRow(key);
  return row ? mapShippingOrder(row) : null;
}
