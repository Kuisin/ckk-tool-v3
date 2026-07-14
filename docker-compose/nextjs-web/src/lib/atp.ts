/**
 * atp.ts — 素材 ATP の Prisma ラッパ（§5 素材判断）。server-only.
 *
 * on-hand/reserved は material_inventory、入荷予定は ORDERED 発注の明細
 * （expected_at + PO 番号）。純ロジックは lib/atp-core.ts。
 */

import {
  type AtpInput,
  type AtpPoint,
  atpNow,
  buildAtpTimeline,
} from "./atp-core";
import { prisma } from "./db";

export interface MaterialAtp {
  materialId: number;
  onHand: number;
  reserved: number;
  availableNow: number;
  timeline: AtpPoint[];
  /** 直近の入荷予定日（確定分のみ）。 */
  nextReceiptDate: string | null;
}

/** 素材の ATP（factoryId 指定で工場別、省略で全工場合算）。 */
export async function materialAtp(
  materialId: number,
  factoryId?: number | null,
): Promise<MaterialAtp> {
  const [invRows, orderedItems] = await Promise.all([
    prisma.materialInventory.findMany({
      where: { materialId, ...(factoryId != null ? { factoryId } : {}) },
    }),
    prisma.materialPurchaseOrderItem.findMany({
      where: {
        materialId,
        ...(factoryId != null ? { factoryId } : {}),
        purchaseOrder: { status: "ORDERED" },
      },
      include: { purchaseOrder: { select: { poNumber: true } } },
    }),
  ]);

  const input: AtpInput = {
    onHand: invRows.reduce((s, r) => s + Number(r.quantity), 0),
    reserved: invRows.reduce((s, r) => s + Number(r.reservedQuantity), 0),
    expectedReceipts: orderedItems.map((it) => ({
      date: it.expectedAt ? it.expectedAt.toISOString().slice(0, 10) : null,
      quantity: Number(it.quantity),
      ref: it.purchaseOrder.poNumber,
    })),
  };

  const timeline = buildAtpTimeline(input);
  const nextReceipt = timeline.find(
    (p) => p.date != null && p.date !== "9999-12-31",
  );
  return {
    materialId,
    onHand: input.onHand,
    reserved: input.reserved,
    availableNow: atpNow(input),
    timeline,
    nextReceiptDate: nextReceipt?.date ?? null,
  };
}
