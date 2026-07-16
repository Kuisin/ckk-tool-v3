/**
 * data.ts — 購買依頼 (PU04) のサーバーサイド取得・マッピング。
 *
 * URL id = request_number（PRQ-YYYYMM-NNNNN、文字列保存）。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 * history Json（{action,user,at,notes}）は displayName 解決して返す。
 * 仕入先（変換モーダル）/ 工場 options は work-orders の data.ts を再利用する。
 */

import type {
  PurchaseRequestRow,
  PurchaseRequestStatus,
  PurchaseRequestView,
} from "@/components/purchase/purchase-requests/model";
import type { HistoryEntry } from "@/lib/approvals";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export {
  fetchFactoryOptions,
  fetchSupplierOptions,
  type Option,
} from "../../production/work-orders/data";

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const dateOnly = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;

/** 一覧 (PU04) — 新しい依頼番号から順に。 */
export async function fetchPurchaseRequests(): Promise<PurchaseRequestRow[]> {
  const rows = await prisma.purchaseRequest.findMany({
    include: {
      createdByUser: { select: { displayName: true } },
      items: {
        include: { material: { select: { code: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { requestNumber: "desc" },
  });
  return rows.map((r) => {
    const desired = r.items
      .map((it) => dateOnly(it.desiredAt))
      .filter((d): d is string => d != null)
      .sort();
    return {
      requestNumber: r.requestNumber,
      requesterName: r.createdByUser?.displayName ?? "システム",
      primaryMaterial: r.items[0]?.material.code ?? null,
      itemCount: r.items.length,
      status: r.status,
      desiredAt: desired[0] ?? null,
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

/** 詳細 (PU24) view model。id = request_number。未存在は null。 */
export async function fetchPurchaseRequest(
  requestNumber: string,
): Promise<PurchaseRequestView | null> {
  const r = await prisma.purchaseRequest.findUnique({
    where: { requestNumber },
    include: {
      createdByUser: { select: { displayName: true } },
      purchaseOrder: { select: { poNumber: true } },
      items: {
        include: { material: true, factory: true },
        orderBy: { sortOrder: "asc" },
      },
    },
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
    requestNumber: r.requestNumber,
    status: r.status as PurchaseRequestStatus,
    purpose: r.purpose,
    requesterName: r.createdByUser?.displayName ?? "システム",
    requestedAt: iso(r.requestedAt),
    approvedAt: iso(r.approvedAt),
    orderedAt: iso(r.orderedAt),
    cancelledAt: iso(r.cancelledAt),
    cancelReason: r.cancelReason,
    purchaseOrderNumber: r.purchaseOrder?.poNumber ?? null,
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
      unit: it.unit,
      desiredAt: dateOnly(it.desiredAt),
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
