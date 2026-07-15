/**
 * data.ts — 受注請書 intake (SA03) のサーバーサイド取得・マッピング。
 *
 * app.order_acceptances は (year_month, seq) の複合キー — 表示番号
 * ORD-YYYYMM-NNNNN は導出（保存しない）で、URL id を兼ねる。
 * 伝票展開後は同じ (year_month, seq) の sales_orders 枝番 1..N を持つため、
 * 詳細では展開済み注文請書番号も併せて返す。
 * Prisma Decimal はここで Number() へ、日付は ISO 文字列へ変換して渡す。
 */

import type {
  OrderAcceptanceItemView,
  OrderAcceptanceListRow,
  OrderAcceptanceView,
} from "@/components/sales/order-acceptances/model";
import { prisma } from "@/lib/db";
import {
  type DocKey,
  formatDocNumber,
  formatProductNumber,
  formatSalesOrderNumber,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

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

/** 一覧 — 新しい採番から順（取込状況一覧）。 */
export async function fetchOrderAcceptances(): Promise<
  OrderAcceptanceListRow[]
> {
  const rows = await prisma.orderAcceptance.findMany({
    include: {
      sourceFile: { select: { filename: true } },
      customerBp: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
  });
  return rows.map((r) => ({
    number: formatDocNumber("ORD", r),
    status: r.status,
    source: r.source,
    sourceFilename: r.sourceFile?.filename ?? null,
    customerName: r.customerBp
      ? localized(r.customerBp.name as LocalizedText | null)
      : null,
    itemCount: r._count.items,
    extractError: r.extractError,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** 1件取得（詳細）。未存在は null。 */
export async function fetchOrderAcceptance(
  key: DocKey,
): Promise<OrderAcceptanceView | null> {
  const r = await prisma.orderAcceptance.findUnique({
    where: { yearMonth_seq: key },
    include: {
      sourceFile: { select: { filename: true } },
      customerBp: { select: { name: true } },
      customerBranchBp: { select: { name: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: { select: { name: true, yearMonth: true, seq: true } },
        },
      },
    },
  });
  if (!r) return null;

  // 伝票展開で生成された注文請書（同一 yearMonth+seq の枝番 1..N）。
  const salesOrders = await prisma.salesOrder.findMany({
    where: { yearMonth: key.yearMonth, seq: key.seq },
    orderBy: { branch: "asc" },
    select: { branch: true },
  });

  const items: OrderAcceptanceItemView[] = r.items.map((it) => ({
    id: it.id,
    productId: it.productId != null ? String(it.productId) : null,
    productLabel: it.product ? productLabel(it.product) : null,
    productText: it.productText,
    orderType: it.orderType,
    quantity: it.quantity,
    unitPrice: it.unitPrice != null ? Number(it.unitPrice) : null,
    deliveryDate: it.deliveryDate?.toISOString().slice(0, 10) ?? null,
    notes: it.notes,
  }));

  return {
    number: formatDocNumber("ORD", r),
    yearMonth: r.yearMonth,
    seq: r.seq,
    status: r.status,
    source: r.source,
    sourceFilename: r.sourceFile?.filename ?? null,
    extractError: r.extractError,
    customerBpId: r.customerBpId,
    customerName: r.customerBp
      ? localized(r.customerBp.name as LocalizedText | null)
      : null,
    customerBranchName: r.customerBranchBp
      ? localized(r.customerBranchBp.name as LocalizedText | null)
      : null,
    customerOrderRef: r.customerOrderRef,
    orderDate: r.orderDate?.toISOString().slice(0, 10) ?? null,
    notes: r.notes,
    items,
    salesOrderNumbers: salesOrders.map((so) =>
      formatSalesOrderNumber({ ...key, branch: so.branch }),
    ),
    completedAt: r.completedAt?.toISOString() ?? null,
    archivedAt: r.archivedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
