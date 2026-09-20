/**
 * atp.ts — 素材 ATP の Prisma ラッパ（§5 素材判断）。server-only.
 *
 * on-hand/reserved は app.item_inventory、入荷予定は ORDERED 発注の明細
 * （expected_at + PO 番号）。純ロジックは lib/atp-core.ts。
 *
 * 品目統合 第 2 段 B — 引数は **items.id**（旧 `materials.id` ではない）。
 * 発注明細（material_purchase_order_items）が item_id を持つようになったので、
 * 以前あった「素材 id → 品目 id」の 1 往復は要らなくなった（呼び出し側が
 * 既に品目 id を持っている）。
 */

import {
  type AtpInput,
  type AtpPoint,
  atpNow,
  buildAtpTimeline,
} from "./atp-core";
import { prisma } from "./db";

export interface MaterialAtp {
  itemId: number;
  onHand: number;
  reserved: number;
  availableNow: number;
  timeline: AtpPoint[];
  /** 直近の入荷予定日（確定分のみ）。 */
  nextReceiptDate: string | null;
}

/** 素材（品目）の ATP（plantId 指定で拠点別、省略で全拠点合算）。 */
export async function materialAtp(
  itemId: number,
  plantId?: number | null,
): Promise<MaterialAtp> {
  const [invRows, orderedItems] = await Promise.all([
    prisma.itemInventory.findMany({
      // 引ける在庫は自社の分だけ（外注へ預けている分は約束に使えない）。
      where: {
        itemId,
        custodyBpId: null,
        ...(plantId != null ? { plantId } : {}),
      },
    }),
    prisma.materialPurchaseOrderItem.findMany({
      where: {
        itemId,
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
          date: it.expectedAt ? it.expectedAt.toISOString().slice(0, 10) : null,
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
    itemId,
    onHand: input.onHand,
    reserved: input.reserved,
    availableNow: atpNow(input),
    timeline,
    nextReceiptDate: nextReceipt?.date ?? null,
  };
}
