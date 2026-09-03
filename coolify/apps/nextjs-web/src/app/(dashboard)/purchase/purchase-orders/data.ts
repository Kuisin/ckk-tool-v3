/**
 * data.ts — 素材発注書 (PU02) のサーバーサイド取得・マッピング。
 *
 * URL id = po_number（PO-YYYYMM-NNNNN、文字列保存）。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 * history Json（{action,user,at,notes}）は displayName 解決して返す。
 * 仕入先 / 拠点 options は work-orders の data.ts を再利用する。
 */

import { ownOrPlantWhere, rowInScope } from "@ckk/authz-core";
import type {
  PurchaseOrderRow,
  PurchaseOrderView,
  PurchaseStatus,
} from "@/components/purchase/purchase-orders/model";
import type { HistoryEntry } from "@/lib/approvals";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import type { Tr } from "@/lib/i18n";

// 一覧クエリの取得上限（監査 P2-8 — 全件フェッチのデータ増加対策）。
// DataTable はクライアントページングのため、最新分のみで実用上十分。
const LIST_FETCH_CAP = 1000;

export {
  fetchPlantOptions,
  fetchSupplierOptions,
  type Option,
} from "../../production/work-orders/data";

const PO_INCLUDE = {
  supplierBp: true,
  createdByUser: { select: { displayName: true } },
  sourceRequest: { select: { requestNumber: true } },
  items: {
    include: { material: true, plant: true },
    orderBy: { sortOrder: "asc" as const },
  },
};

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const dateOnly = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;

/**
 * スコープ（監査 M3）: 発注書の拠点は明細の入荷先（items.plantId）。
 * 拠点スコープの人は自拠点へ入荷する発注書、OWN は自分が起票した分。
 */
function purchaseOrderScope(
  access: Parameters<typeof ownOrPlantWhere>[0],
  userId: string,
): Prisma.MaterialPurchaseOrderWhereInput {
  return ownOrPlantWhere(access, userId, {
    plantClause: (plantIds) => ({
      items: { some: { plantId: { in: plantIds } } },
    }),
    ownColumn: "createdBy",
  }) as Prisma.MaterialPurchaseOrderWhereInput;
}

/** 一覧 (PU02) — 新しい発注番号から順に。 */
export async function fetchPurchaseOrders(): Promise<PurchaseOrderRow[]> {
  const authz = await checkPermission("purchase_order", "READ");
  if (!authz.ok) return [];
  const rows = await prisma.materialPurchaseOrder.findMany({
    take: LIST_FETCH_CAP,
    where: purchaseOrderScope(authz.access, authz.userId),
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

/** 詳細 (PU22) view model。id = po_number。未存在は null。 */
export async function fetchPurchaseOrder(
  poNumber: string,
  tr: Tr,
): Promise<PurchaseOrderView | null> {
  const authz = await checkPermission("purchase_order", "READ");
  if (!authz.ok) return null;
  const r = await prisma.materialPurchaseOrder.findUnique({
    where: { poNumber },
    include: PO_INCLUDE,
  });
  if (!r) return null;
  // スコープ外の行は不可視（null → notFound）。
  if (
    !rowInScope(
      authz.access,
      { plantIds: r.items.map((it) => it.plantId), createdBy: r.createdBy },
      authz.userId,
    )
  ) {
    return null;
  }

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
    (id && users.find((u) => u.id === id)?.displayName) || tr("common.system");

  return {
    id: r.id,
    poNumber: r.poNumber,
    supplierBpId: r.supplierBpId,
    supplierName: localized(r.supplierBp.name as LocalizedText | null),
    createdByName: r.createdByUser?.displayName ?? null,
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
      plantId: it.plantId != null ? String(it.plantId) : null,
      plantName: it.plant
        ? `${it.plant.code} ${localized(it.plant.name as LocalizedText | null)}`
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
