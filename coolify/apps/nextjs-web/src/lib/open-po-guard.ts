/**
 * open-po-guard.ts — 「発注済み・未入荷あり」の発注明細を引く。server-only。
 * 判定は open-po-guard-core.ts。
 */

import "server-only";

import { prisma } from "./db";
import {
  type OpenPoLine,
  openPoConflicts,
  type ReceiptCandidate,
} from "./open-po-guard-core";

export async function findOpenPoConflicts(
  candidates: ReceiptCandidate[],
): Promise<OpenPoLine[]> {
  const itemIds = [...new Set(candidates.map((c) => c.itemId))].filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  if (itemIds.length === 0) return [];
  // 入荷を待っているのは「発注済」の発注書だけ（承認前はまだ届かない、
  // 入荷完了・キャンセルはもう届かない）。
  const rows = await prisma.materialPurchaseOrderItem.findMany({
    where: { itemId: { in: itemIds }, purchaseOrder: { status: "ORDERED" } },
    select: {
      itemId: true,
      quantity: true,
      receivedQuantity: true,
      unit: true,
      purchaseOrder: {
        select: { id: true, poNumber: true, supplierBpId: true },
      },
    },
  });
  return openPoConflicts(
    rows.map((r) => ({
      purchaseOrderId: r.purchaseOrder.id,
      poNumber: r.purchaseOrder.poNumber,
      supplierBpId: r.purchaseOrder.supplierBpId,
      itemId: r.itemId,
      remaining: Number(r.quantity) - Number(r.receivedQuantity),
      unit: r.unit,
    })),
    candidates,
  );
}

/** 確認なしで保存しようとしたときのエラー文（発注番号を並べる）。 */
export function openPoErrorMessage(
  conflicts: OpenPoLine[],
  tr: (key: string, vars?: Record<string, string>) => string,
): string {
  return tr("purchase.materialReceipts.openPo.blocked", {
    list: conflicts.map((c) => c.poNumber).join(", "),
  });
}
