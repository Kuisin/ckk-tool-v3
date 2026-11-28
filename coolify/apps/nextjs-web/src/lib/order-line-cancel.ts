/**
 * order-line-cancel.ts — 注文明細キャンセルの伝播（監査 P1-1）。
 *
 * 明細を CANCELLED にするだけでは予約リーク・孤児指示書が残るので、
 * 予約の全量解放 + **未完了**の子指示書の連鎖キャンセルまでを 1 セットで行う
 * （「未着手」ではない — 進行中の指示書も倒す。完了済みだけが対象外）。
 *
 * **進行中の工程を倒すときは作業セッションも畳む。** 工程を CANCELLED に
 * してしまうと、open な実績行（`ended_at IS NULL`）を閉じられる経路が 1 つも
 * 無くなる（pause / complete / abort はどれも IN_PROGRESS を要求する）。
 * 残すと accumulated work time が増え続け、セッションロックは誰のものでも
 * ない保持者として永久に残る（強制解除の口は cron も画面も無い）。
 * かつては注文明細詳細（SA25）の単票キャンセルが呼んでいたが、明細単位の
 * キャンセル操作は廃止 — 現在の唯一の呼び出し元は**注文請書キャンセル**
 * （lib/order-acceptance-cancel.ts — 承認後に全明細へ適用）。
 */

import "server-only";

import type { Prisma } from "../../generated/client/client";
import {
  type MovementOpener,
  releaseOrderLineReservations,
  releaseWorkOrderReservations,
} from "./inventory";

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
 *
 * 作業者ごとの同時数（`concurrent_count`）は**張り直さない**。あれは共有端末の
 * 生きたセッションだけが維持しているもの（nextjs-web は手入力の実績でも
 * 既定の 1 のまま書く）で、その作業者が次に共有端末で一時停止・完了を押した
 * ときに `resegmentOpenActuals` が数え直して直る。
 * 出荷済（SHIPPED）・キャンセル済は対象外（cancelled: false で返る）。
 * 統合ロット — 他の有効な明細も束ねている指示書 — は残す（他明細の生産を
 * 止めない。割当行は監査のため残る）。
 */
export async function cancelOrderLineTx(
  tx: Tx,
  lineId: string,
  auditNote: string,
  openMovement: MovementOpener,
  /**
   * 取り消した人。連鎖キャンセルした工程の `cancelled_by` に入れる。
   * null でも通る（移行前の呼び出し・システム実行）。
   */
  actorId: string | null = null,
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
  let released = await releaseOrderLineReservations(
    tx,
    lineId,
    auditNote,
    openMovement,
  );
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
    const now = new Date();
    // **作業セッションを先に閉じる。** 進行中の工程を倒す前にやる必要がある —
    // 下の updateMany で CANCELLED にしてしまうと、以後この行を閉じられる経路が
    // 1 つも無くなる（pause / complete / abort はどれも IN_PROGRESS を要求し、
    // 実績行の削除も完了・キャンセル済みの工程では拒否される）。
    //
    // 閉じないと `ended_at IS NULL` の行が永久に残り、accumulatedWorkMs は
    // open な行を「今も動いている」と数えるので、**キャンセル済みの工程の
    // 作業時間が増え続ける**。
    const liveSteps = await tx.workOrderStep.findMany({
      where: {
        workOrderId: wo.id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      select: { id: true },
    });
    const liveStepIds = liveSteps.map((s) => s.id);
    if (liveStepIds.length > 0) {
      await tx.workOrderStepActual.updateMany({
        where: { stepId: { in: liveStepIds }, endedAt: null },
        data: { endedAt: now },
      });
    }
    await tx.workOrderStep.updateMany({
      where: {
        workOrderId: wo.id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelledBy: actorId,
        cancelReason: auditNote,
        // **セッションロックも外す。** 外さないと誰のものでもない保持者が
        // 永久に残る（強制解除の口は cron も画面も無い）。
        sessionLockedBy: null,
        sessionLockedAt: null,
      },
    });
    // 明細スコープの解放（上）だけでは、指示書そのものに付いた予約
    // （承認時の素材予約）が RESERVED のまま残る。cancelWorkOrder は
    // こちらも呼んでいるので、連鎖キャンセルでも同じだけ解放する。
    released += await releaseWorkOrderReservations(
      tx,
      wo.id,
      auditNote,
      openMovement,
    );
    cancelledWos.push(wo.workOrderNumber);
  }
  return { cancelled: true, released, cancelledWos };
}
