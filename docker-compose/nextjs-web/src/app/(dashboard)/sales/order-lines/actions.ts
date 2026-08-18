"use server";

/**
 * Server Actions — 注文明細 (app.order_lines, SA05).
 *
 * この画面は**実行専用**。明細の作成・編集は注文請書 (SA04) の明細エディタが
 * 唯一の入口で、確定（承認 → 確定）後は変更不可
 * （判定は lib/order-line-core.ts に集約）。ここに残るのは在庫照合と
 * キャンセルという、確定後にしか意味を持たない操作だけ。
 *
 * 表示番号 ORD-YYYYMM-NNNNN-NN は注文請書キー + 枝番から導出（保存しない）。
 */

import { type Access, rowInScope } from "@ckk/authz-core";
import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  formatOrderLineNumber,
  orderLineWhereKey,
  parseOrderLineKey,
} from "@/lib/doc-number";
import {
  releaseOrderLineReservations,
  reserveProductStock,
  type StockCheckResult,
} from "@/lib/inventory";
import { isLineCancellable, isLineStockCheckable } from "@/lib/order-line-core";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/sales/order-lines";
const SCOPE_DENIED = "この操作の権限がありません（対象範囲外）";

/**
 * 対象注文明細がスコープ内か（PLANT = 配下指示書の工程実施拠点 ∪ OWN =
 * 注文請書の作成者）。ALL は素通し。不存在は true — 既存エラー処理に委ねる。
 */
async function orderLineInScope(
  access: Access,
  userId: string,
  where:
    | { acceptanceYearMonth: string; acceptanceSeq: number; branch: number }
    | { id: string },
): Promise<boolean> {
  if (access.kind === "ALL") return true;
  const row = await prisma.orderLine.findFirst({
    where,
    select: {
      acceptance: { select: { createdBy: true } },
      workOrders: { select: { steps: { select: { plantId: true } } } },
    },
  });
  if (!row) return true;
  return rowInScope(
    access,
    {
      plantIds: row.workOrders.flatMap((w) => w.steps.map((s) => s.plantId)),
      createdBy: row.acceptance.createdBy,
    },
    userId,
  );
}

function revalidate(number?: string) {
  revalidatePath(BASE_PATH);
  if (number) revalidatePath(`${BASE_PATH}/${encodeURIComponent(number)}`);
}

/** parseOrderLineKey の結果 → Prisma の where 用スコープキー。 */
function scopeKeyOf(key: { yearMonth: string; seq: number; branch: number }) {
  return {
    acceptanceYearMonth: key.yearMonth,
    acceptanceSeq: key.seq,
    branch: key.branch,
  };
}

/**
 * §4 在庫照合 + 引当予約 — lib/inventory reserveProductStock のラッパ。
 * 二段照合（レコード有無 → 利用可能数）を行い、可能な分を RESERVE する。
 * 不足分は指示書（MANUFACTURE）作成の材料 — 呼び出し側の UI で誘導する。
 * 確定済み・製造前の注文明細のみ実行可（製造中以降は指示書側で管理）。
 */
export async function runStockCheck(
  orderLineId: string,
): Promise<ActionResult<StockCheckResult>> {
  // 在庫予約（RESERVE）を発生させるが、注文明細フローの操作なので
  // "inventory" ではなく受注側の権限で判定する（判断メモ）。
  const authz = await checkPermission("order_acceptance", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!orderLineId) return actionError("注文明細が不正です");
  if (
    !(await orderLineInScope(authz.access, authz.userId, { id: orderLineId }))
  ) {
    return actionError(SCOPE_DENIED);
  }
  try {
    const line = await prisma.orderLine.findUnique({
      where: { id: orderLineId },
      select: {
        status: true,
        acceptanceYearMonth: true,
        acceptanceSeq: true,
        branch: true,
      },
    });
    if (!line) return actionError("対象の注文明細が見つかりません");
    if (line.branch == null) {
      return actionError("確定前の注文明細は在庫照合できません");
    }
    if (!isLineStockCheckable(line)) {
      return actionError("確定済み・製造前の注文明細のみ在庫照合できます");
    }
    const result = await reserveProductStock(orderLineId);
    revalidate(
      formatOrderLineNumber({
        yearMonth: line.acceptanceYearMonth,
        seq: line.acceptanceSeq,
        branch: line.branch,
      }),
    );
    // 在庫台帳（予約数）が動くため在庫ページも再検証する。
    revalidatePath("/production/inventory");
    return actionOk(result);
  } catch (e) {
    return actionError(prismaErrorMessage(e, "在庫照合に失敗しました"));
  }
}

/** キャンセル — 出荷済（SHIPPED）以降・キャンセル済は不可。 */
export async function cancelOrderLine(number: string): Promise<ActionResult> {
  const authz = await checkPermission("order_acceptance", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const key = parseOrderLineKey(number);
  if (!key) return actionError("注文明細番号が不正です");
  if (!(await orderLineInScope(authz.access, authz.userId, scopeKeyOf(key)))) {
    return actionError(SCOPE_DENIED);
  }
  try {
    const prior = await prisma.orderLine.findUnique({
      where: orderLineWhereKey(key),
      select: { status: true },
    });
    if (prior && !isLineCancellable(prior)) {
      return actionError(
        "出荷済・キャンセル済の注文明細はキャンセルできません",
      );
    }
    // キャンセルの伝播（監査 P1-1）: 予約の全量解放 + 未着手の子指示書を
    // 連鎖キャンセル — 予約リーク・孤児 WO を残さない。単一 tx。
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.orderLine.updateMany({
        where: {
          ...scopeKeyOf(key),
          status: {
            in: ["DRAFT", "CONFIRMED", "IN_PRODUCTION", "PARTIAL_SHIPPED"],
          },
        },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      if (updated.count === 0) return { cancelled: false as const };
      const line = await tx.orderLine.findUniqueOrThrow({
        where: orderLineWhereKey(key),
        select: { id: true },
      });
      const released = await releaseOrderLineReservations(
        tx,
        line.id,
        `注文明細 ${number} キャンセルによる予約解放`,
      );
      // 未完了の子指示書を連鎖キャンセル（完了済みは在庫計上済みのため対象外）
      const childWos = await tx.workOrder.findMany({
        where: {
          orderLineId: line.id,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        select: { id: true, workOrderNumber: true },
      });
      for (const wo of childWos) {
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
            cancelReason: `注文明細 ${number} キャンセルに伴う連鎖キャンセル`,
          },
        });
      }
      return {
        cancelled: true as const,
        released,
        cancelledWos: childWos.map((w) => w.workOrderNumber),
      };
    });
    if (!result.cancelled) {
      return actionError(
        "出荷済・キャンセル済の注文明細はキャンセルできません",
      );
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "order_lines",
      recordId: number,
      before: { status: prior?.status ?? null },
      after: {
        status: "CANCELLED",
        note: `予約解放 ${result.released} 件 / 連鎖キャンセル指示書 ${result.cancelledWos.length} 件${result.cancelledWos.length ? `（#${result.cancelledWos.join(", #")}）` : ""}`,
      },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "キャンセルに失敗しました"));
  }
}
