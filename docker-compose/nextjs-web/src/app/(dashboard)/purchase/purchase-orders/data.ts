/**
 * data.ts — 素材発注書 (PU03) のサーバーサイド取得・マッピング。
 *
 * URL id = po_number（PO-YYYYMM-NNNNN、文字列保存）。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 * history Json（{action,user,at,notes}）は displayName 解決して返す。
 * 仕入先 / 工場 options は work-orders の data.ts を再利用する。
 */

import type {
  PurchaseOrderRow,
  PurchaseOrderView,
  PurchaseStatus,
} from "@/components/purchase/purchase-orders/model";
import type { HistoryEntry } from "@/lib/approvals";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export {
  fetchFactoryOptions,
  fetchSupplierOptions,
  type Option,
} from "../../production/work-orders/data";

const PO_INCLUDE = {
  supplierBp: true,
  sourceRequest: { select: { requestNumber: true } },
  items: {
    include: { material: true, factory: true },
    orderBy: { sortOrder: "asc" as const },
  },
};

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const dateOnly = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;

/** 一覧 (PU03) — 新しい発注番号から順に。 */
export async function fetchPurchaseOrders(): Promise<PurchaseOrderRow[]> {
  const rows = await prisma.materialPurchaseOrder.findMany({
    include: {
      supplierBp: true,
      _count: { select: { items: true } },
    },
    orderBy: { poNumber: "desc" },
  });
  return rows.map((r) => ({
    poNumber: r.poNumber,
    supplierName: localized(r.supplierBp.name as LocalizedText | null),
    itemCount: r._count.items,
    totalAmount: Number(r.totalAmount),
    status: r.status,
    purchaseDate: dateOnly(r.purchaseDate),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** 詳細 (PU23) view model。id = po_number。未存在は null。 */
export async function fetchPurchaseOrder(
  poNumber: string,
): Promise<PurchaseOrderView | null> {
  const r = await prisma.materialPurchaseOrder.findUnique({
    where: { poNumber },
    include: PO_INCLUDE,
  });
  if (!r) return null;

  // history Json の user uuid → displayName 解決
  const historyRaw: HistoryEntry[] = Array.isArray(r.history)
    ? (r.history as unknown as HistoryEntry[])
    : [];
  const userIds = new Set<string>();
  for (const h of historyRaw) if (h.user) userIds.add(h.user);
  const users = userIds.size
    ? await prisma.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameOf = (id: string | null | undefined) =>
    (id && users.find((u) => u.id === id)?.displayName) || "システム";

  return {
    id: r.id,
    poNumber: r.poNumber,
    supplierBpId: r.supplierBpId,
    supplierName: localized(r.supplierBp.name as LocalizedText | null),
    sourceRequestNumber: r.sourceRequest?.requestNumber ?? null,
    status: r.status as PurchaseStatus,
    totalAmount: Number(r.totalAmount),
    currency: r.currency,
    purchaseDate: dateOnly(r.purchaseDate),
    requestedAt: iso(r.requestedAt),
    approvedAt: iso(r.approvedAt),
    orderedAt: iso(r.orderedAt),
    completedAt: iso(r.completedAt),
    cancelledAt: iso(r.cancelledAt),
    cancelReason: r.cancelReason,
    notes: r.notes,
    items: r.items.map((it) => ({
      id: it.id,
      materialId: String(it.materialId),
      materialCode: it.material.code,
      materialName: localized(it.material.name as LocalizedText | null),
      factoryId: it.factoryId != null ? String(it.factoryId) : null,
      factoryName: it.factory
        ? `${it.factory.code} ${localized(it.factory.name as LocalizedText | null)}`
        : null,
      quantity: Number(it.quantity),
      receivedQuantity: Number(it.receivedQuantity),
      unit: it.unit,
      unitPrice: Number(it.unitPrice),
      amount: Number(it.amount),
      expectedAt: dateOnly(it.expectedAt),
      notes: it.notes,
      sortOrder: it.sortOrder,
    })),
    history: historyRaw.map((h) => ({
      action: h.action,
      user: nameOf(h.user),
      at: h.at,
      notes: h.notes ?? null,
    })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
