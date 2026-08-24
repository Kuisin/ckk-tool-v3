import "server-only";

/**
 * work-order-alloc — 指示書割当の server 側集計。
 *
 * 明細ごとの「手配済み（実効）」を 1 箇所で計算する。ルールは
 * work-order-alloc-core の effectiveAllocated:
 *   - 未完了の指示書 = 割当数のまま
 *   - 完了済み = min(割当数, 実際の完成配分) — 不良で割当より少なく
 *     しかできなかったぶんは受注残へ戻る（追加手配できる）
 *   - キャンセル済み = 数えない
 *
 * 使う側: 指示書の作成/更新検証・ビルダーの残数表示・未手配キュー (PD05)・
 * 注文明細検索（受注残ゼロの明細を候補から外す）。
 */

import { prisma } from "@/lib/db";
import {
  distributeFinished,
  effectiveAllocated,
} from "@/lib/work-order-alloc-core";
import {
  computeFinishedQuantity,
  STEP_LINK_STATE_SELECT,
  STEP_STATE_SELECT,
  toStepState,
} from "@/lib/workflow-core";

/**
 * 明細ごとの手配済み（実効）数量。戻り値の Map に無い id は手配ゼロ。
 * excludeWorkOrderNumber は編集中の自指示書を除くため（検証用）。
 */
export async function effectiveAllocatedByLine(
  orderLineIds: readonly string[],
  opts: { excludeWorkOrderNumber?: number | null } = {},
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (orderLineIds.length === 0) return out;
  const links = await prisma.workOrderOrderLine.findMany({
    where: {
      orderLineId: { in: [...orderLineIds] },
      workOrder: {
        status: { not: "CANCELLED" },
        ...(opts.excludeWorkOrderNumber != null
          ? { workOrderNumber: { not: opts.excludeWorkOrderNumber } }
          : {}),
      },
    },
    select: {
      orderLineId: true,
      quantity: true,
      workOrder: {
        select: {
          id: true,
          status: true,
          // 完成配分はエンジンが読む列だけ（STEP_STATE_SELECT — workflow-core
          // 参照）。全列 SELECT は列追加のたび migration 前の DB で P2022 に落ちる。
          steps: { select: STEP_STATE_SELECT },
          stepLinks: { select: STEP_LINK_STATE_SELECT },
          orderLineLinks: {
            select: { orderLineId: true, quantity: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });

  // 完了済み指示書の完成配分は指示書単位で 1 回だけ計算する（統合ロットで
  // 複数明細ぶんのリンクが並ぶため）。
  const sharesByWo = new Map<string, Map<string, number>>();
  const finishedShareOf = (link: (typeof links)[number]): number | null => {
    if (link.workOrder.status !== "COMPLETED") return null;
    let shares = sharesByWo.get(link.workOrder.id);
    if (!shares) {
      const finished = computeFinishedQuantity(
        link.workOrder.steps.map(toStepState),
        link.workOrder.stepLinks,
      );
      shares = distributeFinished(link.workOrder.orderLineLinks, finished);
      sharesByWo.set(link.workOrder.id, shares);
    }
    return shares.get(link.orderLineId) ?? 0;
  };

  const byLine = new Map<
    string,
    {
      quantity: number;
      workOrderStatus: string;
      finishedShare: number | null;
    }[]
  >();
  for (const link of links) {
    const list = byLine.get(link.orderLineId) ?? [];
    list.push({
      quantity: link.quantity,
      workOrderStatus: link.workOrder.status,
      finishedShare: finishedShareOf(link),
    });
    byLine.set(link.orderLineId, list);
  }
  for (const [lineId, list] of byLine) {
    out.set(lineId, effectiveAllocated(list));
  }
  return out;
}
