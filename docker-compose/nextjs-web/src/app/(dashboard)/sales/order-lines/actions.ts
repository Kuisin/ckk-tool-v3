"use server";

/**
 * Server Actions — 注文明細 (app.order_lines, SA05).
 *
 * この画面は**実行専用**。明細の作成・編集は注文請書 (SA04) の明細エディタが
 * 唯一の入口で、確定（承認 → 確定）後は変更不可
 * （判定は lib/order-line-core.ts に集約）。ここに残るのは在庫照合だけ —
 * **明細単位のキャンセルは廃止**。キャンセルは注文請書ごと依頼して承認を
 * 通す（SA24 の「キャンセル依頼」→ lib/order-acceptance-cancel.ts）。
 *
 * 表示番号 ORD-YYYYMM-NNNNN-NN は注文請書キー + 枝番から導出（保存しない）。
 */

import { type Access, rowInScope } from "@ckk/authz-core";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatOrderLineNumber } from "@/lib/doc-number";
import { reserveProductStock, type StockCheckResult } from "@/lib/inventory";
import { isLineStockCheckable } from "@/lib/order-line-core";
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
      workOrderLinks: {
        select: {
          workOrder: { select: { steps: { select: { plantId: true } } } },
        },
      },
    },
  });
  if (!row) return true;
  return rowInScope(
    access,
    {
      plantIds: row.workOrderLinks.flatMap((l) =>
        l.workOrder.steps.map((s) => s.plantId),
      ),
      createdBy: row.acceptance.createdBy,
    },
    userId,
  );
}

function revalidate(number?: string) {
  revalidatePath(BASE_PATH);
  if (number) revalidatePath(`${BASE_PATH}/${encodeURIComponent(number)}`);
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
