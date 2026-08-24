/**
 * work-order-links.ts — 指示書→指示書リンク（work_order_links）の Prisma 層。
 * server-only。不変条件（自己/重複/閉路/数量）の判定は
 * lib/work-order-links-core.ts が唯一の定義 — ここは存在・状態の検証と
 * トランザクション内の閉路検証・永続化を担う。
 */

import { getCurrentActorId, recordAudit } from "./audit";
import { prisma } from "./db";
import {
  validateNewWoLink,
  WO_LINK_ISSUE_MESSAGE,
} from "./work-order-links-core";

/** リンクを追加できる target の状態（未着手のみ — 開始後は受入が確定済み）。 */
const LINKABLE_TARGET_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED"];

export interface WoLinkResult {
  ok: boolean;
  error?: string;
}

/** 先行リンクの追加: source（先行）→ target（後続）。 */
export async function addWorkOrderLink(input: {
  sourceWorkOrderNumber: number;
  targetWorkOrderNumber: number;
  /** null = source 完了時の完成数全量。 */
  quantity: number | null;
  notes?: string | null;
}): Promise<WoLinkResult> {
  const [source, target] = await Promise.all([
    prisma.workOrder.findUnique({
      where: { workOrderNumber: input.sourceWorkOrderNumber },
      select: { id: true, status: true, workOrderNumber: true },
    }),
    prisma.workOrder.findUnique({
      where: { workOrderNumber: input.targetWorkOrderNumber },
      select: { id: true, status: true, workOrderNumber: true },
    }),
  ]);
  if (!source)
    return {
      ok: false,
      error: `先行指示書 #${input.sourceWorkOrderNumber} が見つかりません`,
    };
  if (!target)
    return {
      ok: false,
      error: `指示書 #${input.targetWorkOrderNumber} が見つかりません`,
    };
  if (source.status === "CANCELLED" || target.status === "CANCELLED")
    return { ok: false, error: "キャンセル済みの指示書にはリンクできません" };
  if (!LINKABLE_TARGET_STATUSES.includes(target.status))
    return {
      ok: false,
      error:
        "着手済みの指示書には先行リンクを追加できません（受入は開始時に確定済み）",
    };

  const actor = await getCurrentActorId();
  try {
    await prisma.$transaction(async (tx) => {
      // 閉路検証は tx 内で全エッジを読み直して行う（同時追加の競合対策）。
      const edges = await tx.workOrderLink.findMany({
        select: { sourceWorkOrderId: true, targetWorkOrderId: true },
      });
      const issue = validateNewWoLink(
        edges,
        { sourceWorkOrderId: source.id, targetWorkOrderId: target.id },
        input.quantity,
      );
      if (issue) throw new Error(WO_LINK_ISSUE_MESSAGE[issue.kind]);
      await tx.workOrderLink.create({
        data: {
          sourceWorkOrderId: source.id,
          targetWorkOrderId: target.id,
          quantity: input.quantity,
          notes: input.notes?.trim() || null,
          createdBy: actor,
        },
      });
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "リンクの追加に失敗しました",
    };
  }
  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(target.workOrderNumber),
    after: {
      note: `先行指示書 #${source.workOrderNumber} をリンク`,
      quantity: input.quantity,
    },
  });
  return { ok: true };
}

/** 先行リンクの解除（target 側から解く）。 */
export async function removeWorkOrderLink(
  linkId: string,
): Promise<WoLinkResult> {
  const link = await prisma.workOrderLink.findUnique({
    where: { id: linkId },
    select: {
      id: true,
      sourceWorkOrder: { select: { workOrderNumber: true } },
      targetWorkOrder: { select: { workOrderNumber: true, status: true } },
    },
  });
  if (!link) return { ok: false, error: "リンクが見つかりません" };
  // 着手後の解除も許可する — source がキャンセルされた場合など、ゲートを
  // 外せないと後続が永久に止まるため。完了済みだけは記録として触らない。
  if (link.targetWorkOrder.status === "COMPLETED")
    return { ok: false, error: "完了済みの指示書のリンクは解除できません" };
  await prisma.workOrderLink.delete({ where: { id: linkId } });
  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(link.targetWorkOrder.workOrderNumber),
    after: {
      note: `先行指示書 #${link.sourceWorkOrder.workOrderNumber} のリンクを解除`,
    },
  });
  return { ok: true };
}
