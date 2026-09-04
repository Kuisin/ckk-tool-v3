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

/** 素材の ATP（plantId 指定で拠点別、省略で全拠点合算）。 */
export async function materialAtp(
  materialId: number,
  plantId?: number | null,
): Promise<MaterialAtp> {
  const [invRows, orderedItems] = await Promise.all([
    prisma.materialInventory.findMany({
      where: { materialId, ...(plantId != null ? { plantId } : {}) },
    }),
    prisma.materialPurchaseOrderItem.findMany({
      where: {
        materialId,
        ...(plantId != null ? { plantId } : {}),
        purchaseOrder: { status: "ORDERED" },
      },
      include: { purchaseOrder: { select: { poNumber: true } } },
    }),
  ]);

  const input: AtpInput = {
    onHand: invRows.reduce((s, r) => s + Number(r.quantity), 0),
    reserved: invRows.reduce((s, r) => s + Number(r.reservedQuantity), 0),
    // 入荷予定 = 発注数 − 入荷済み数。部分入荷は IN として on-hand に既に
    // 載っているので、全量を数えると二重計上になる（PO は全量入荷まで
    // ORDERED のまま）。残りが 0 の明細は予定から外す。
    expectedReceipts: orderedItems.flatMap((it) => {
      const remaining = Number(it.quantity) - Number(it.receivedQuantity);
      if (!(remaining > 0)) return [];
      return [
        {
          date: it.expectedAt
            ? it.expectedAt.toISOString().slice(0, 10)
            : null,
          quantity: remaining,
          ref: it.purchaseOrder.poNumber,
        },
      ];
    }),
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
