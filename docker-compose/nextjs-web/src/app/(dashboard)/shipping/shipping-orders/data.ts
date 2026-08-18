/**
 * data.ts — 出荷書 (SH01) ページのサーバーサイド取得・マッピング。
 *
 * app.shipping_orders は (year_month, seq) の複合キー — 表示番号
 * SHP-YYYYMM-NNNNN は導出（保存しない）で、URL id を兼ねる。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 */

import { plantWhere, rowInScope } from "@ckk/authz-core";
import type {
  ShippingOrder,
  ShippingOrderStatus,
  ShippingType,
} from "@/components/shipping/shipping-orders/model";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import {
  type DocKey,
  formatDocNumber,
  formatProductNumber,
  orderLineNumberOf,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

// 一覧クエリの取得上限（監査 P2-8 — 全件フェッチのデータ増加対策）。
// DataTable はクライアントページングのため、最新分のみで実用上十分。
const LIST_FETCH_CAP = 1000;

const SHIPPING_ORDER_INCLUDE = {
  // 顧客はヘッダが権威。注文明細は明細行ごとに紐付く。
  customerBp: true,
  customerBranchBp: true,
  workOrder: true,
  fromPlant: true,
  items: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      product: true,
      orderLine: {
        select: {
          acceptanceYearMonth: true,
          acceptanceSeq: true,
          branch: true,
        },
      },
    },
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
    customerId: r.customerBpId,
    customerName: localized(r.customerBp.name as LocalizedText | null),
    customerBranchName: r.customerBranchBp
      ? localized(r.customerBranchBp.name as LocalizedText | null)
      : null,
    orderLineNumbers: [
      ...new Set(
        r.items
          .map((it) => (it.orderLine ? orderLineNumberOf(it.orderLine) : null))
          .filter((n): n is string => Boolean(n)),
      ),
    ],
    workOrderNumber: r.workOrder?.workOrderNumber ?? null,
    fromPlantId: r.fromPlantId != null ? String(r.fromPlantId) : null,
    fromPlantName: r.fromPlant
      ? localized(r.fromPlant.name as LocalizedText | null)
      : null,
    type: r.type as ShippingType,
    status: r.status as ShippingOrderStatus,
    shippedAt: r.shippedAt?.toISOString() ?? null,
    notes: r.notes,
    items: r.items.map((it) => ({
      id: it.id,
      orderLineId: it.orderLineId,
      orderLineNumber: it.orderLine ? orderLineNumberOf(it.orderLine) : null,
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
  // スコープ行フィルタ（PLANT = 出荷元拠点。ALL は {} で従来通り全件）。
  const authz = await checkPermission("shipping_order", "READ");
  if (!authz.ok) return [];
  const rows = await prisma.shippingOrder.findMany({
    take: LIST_FETCH_CAP,
    where: plantWhere(
      authz.access,
      "fromPlantId",
    ) as Prisma.ShippingOrderWhereInput,
    include: SHIPPING_ORDER_INCLUDE,
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
  });
  return rows.map(mapShippingOrder);
}

/** 1件取得 — 未存在・スコープ外は null。 */
export async function fetchShippingOrder(
  key: DocKey,
): Promise<ShippingOrder | null> {
  const authz = await checkPermission("shipping_order", "READ");
  if (!authz.ok) return null;
  const row = await findRow(key);
  if (!row) return null;
  if (
    !rowInScope(authz.access, { plantIds: [row.fromPlantId] }, authz.userId)
  ) {
    return null;
  }
  return mapShippingOrder(row);
}
