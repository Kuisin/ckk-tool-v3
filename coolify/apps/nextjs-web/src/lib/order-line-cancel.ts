/**
 * order-line-cancel.ts — 注文明細キャンセルの伝播（監査 P1-1）。
 *
 * 明細を CANCELLED にするだけでは予約リーク・孤児指示書が残るので、
 * 予約の全量解放 + 未着手の子指示書の連鎖キャンセルまでを 1 セットで行う。
 * かつては注文明細詳細（SA25）の単票キャンセルが呼んでいたが、明細単位の
 * キャンセル操作は廃止 — 現在の唯一の呼び出し元は**注文請書キャンセル**
 * （lib/order-acceptance-cancel.ts — 承認後に全明細へ適用）。
 */

import "server-only";

import type { Prisma } from "../../generated/client/client";
import { releaseOrderLineReservations } from "./inventory";

type Tx = Prisma.TransactionClient;

export interface LineCancelResult {
  /** 実際にキャンセルしたか（対象ステータス外なら false）。 */
  cancelled: boolean;
  /** 解放した予約の件数。 */
  released: number;
  /** 連鎖キャンセルした指示書番号。 */
  cancelledWos: number[];
}

/**
 * 1 明細をキャンセルし、予約解放 + 未完了の子指示書の連鎖キャンセルを行う。
 * 出荷済（SHIPPED）・キャンセル済は対象外（cancelled: false で返る）。
 * 統合ロット — 他の有効な明細も束ねている指示書 — は残す（他明細の生産を
 * 止めない。割当行は監査のため残る）。
 */
export async function cancelOrderLineTx(
  tx: Tx,
  lineId: string,
  auditNote: string,
): Promise<LineCancelResult> {
  const updated = await tx.orderLine.updateMany({
    where: {
      id: lineId,
      status: {
        in: ["DRAFT", "CONFIRMED", "IN_PRODUCTION", "PARTIAL_SHIPPED"],
      },
    },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  if (updated.count === 0) {
    return { cancelled: false, released: 0, cancelledWos: [] };
  }
  const released = await releaseOrderLineReservations(tx, lineId, auditNote);
  // 未完了の子指示書を連鎖キャンセル（完了済みは在庫計上済みのため対象外）。
  const childWos = await tx.workOrder.findMany({
    where: {
      orderLineLinks: { some: { orderLineId: lineId } },
      status: { notIn: ["COMPLETED", "CANCELLED"] },
    },
    select: {
      id: true,
      workOrderNumber: true,
      orderLineLinks: {
        select: {
          orderLineId: true,
          orderLine: { select: { status: true } },
        },
      },
    },
  });
  const cancelledWos: number[] = [];
  for (const wo of childWos) {
    const hasOtherActiveLine = wo.orderLineLinks.some(
      (l) => l.orderLineId !== lineId && l.orderLine.status !== "CANCELLED",
    );
    if (hasOtherActiveLine) continue;
    await tx.workOrder.update({
      where: { id: wo.id },
      data: { status: "CANCELLED" },
    });
    await tx.workOrderStep.updateMany({
      where: {
        workOrderId: wo.id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: auditNote,
      },
    });
    cancelledWos.push(wo.workOrderNumber);
  }
  return { cancelled: true, released, cancelledWos };
}
