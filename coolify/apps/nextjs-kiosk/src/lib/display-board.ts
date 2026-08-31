/**
 * display-board.ts — 生産ボードのデータ取得。server-only.
 *
 * 進行中・着手待ちの指示書を拠点（と作業場所）で絞って読む。整形・並べ替え・
 * ページ分割は display-board-core.ts が持つ（ここは DB から素材を集めるだけ）。
 *
 * キオスクは業務データを自前で読む方針（nextjs-web の内部 API を叩かない）。
 * ここも steps.ts と同じく Prisma で直接引く。
 */

import { prisma } from "./db";
import type { BoardRow, BoardStep } from "./display-board-core";
import { localized } from "./format";

export type BoardFilter = {
  plantId?: number | null;
  workLocationId?: number | null;
};

/**
 * ボードに出す指示書。承認済み・進行中のみ（下書きや完了済みは出さない —
 * 壁の画面に出す価値があるのは「いま流れているもの」だけ）。
 */
export async function loadProductionBoard(
  filter: BoardFilter = {},
): Promise<BoardRow[]> {
  const workOrders = await prisma.workOrder.findMany({
    where: {
      status: { in: ["APPROVED", "IN_PROGRESS"] },
      // 拠点の絞り込みは工程側で見る（指示書は拠点を持たない —
      // 工程ごとに実施拠点が違い得るため）
      ...(filter.plantId
        ? { steps: { some: { plantId: filter.plantId } } }
        : {}),
      ...(filter.workLocationId
        ? {
            steps: {
              some: {
                plans: { some: { workLocationId: filter.workLocationId } },
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      workOrderNumber: true,
      yearMonth: true,
      seq: true,
      plannedQuantity: true,
      product: { select: { name: true } },
      steps: {
        select: {
          id: true,
          sortOrder: true,
          status: true,
          sessionLockedBy: true,
          inputQuantity: true,
          outputSuccessQuantity: true,
          processStep: { select: { name: true } },
          plans: {
            select: { user: { select: { displayName: true } } },
            orderBy: { plannedDate: "asc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    // 画面に出せる量には限りがあるので、古い順に十分な数だけ。
    orderBy: { workOrderNumber: "asc" },
    take: 100,
  });

  return workOrders.map((wo): BoardRow => {
    const steps: BoardStep[] = wo.steps.map((s) => ({
      id: s.id,
      name: localized(s.processStep.name as { ja: string; en: string }),
      sortOrder: s.sortOrder,
      status: s.status,
      // 一時停止は状態ではなく導出 — 進行中なのにロックが空いている
      // （nextjs-web / キオスクと同じ規約。ここでも同じ式で判断する）
      paused: s.status === "IN_PROGRESS" && s.sessionLockedBy === null,
      inputQuantity: s.inputQuantity,
      outputSuccessQuantity: s.outputSuccessQuantity,
      assignees: [
        ...new Set(s.plans.map((p) => p.user.displayName).filter(Boolean)),
      ],
    }));

    return {
      workOrderId: wo.id,
      lotNumber: wo.workOrderNumber,
      documentNumber: `WOR-${wo.yearMonth}-${String(wo.seq).padStart(5, "0")}`,
      productName: localized(wo.product.name as { ja: string; en: string }),
      plannedQuantity: wo.plannedQuantity,
      steps,
    };
  });
}

/** 拠点名（見出しに出す）。指定なし・見つからないときは null。 */
export async function plantNameOf(
  plantId: number | null | undefined,
): Promise<string | null> {
  if (!plantId) return null;
  const plant = await prisma.plant.findUnique({
    where: { id: plantId },
    select: { name: true },
  });
  if (!plant) return null;
  const name = localized(plant.name as { ja: string; en: string });
  return name === "—" ? null : name;
}
