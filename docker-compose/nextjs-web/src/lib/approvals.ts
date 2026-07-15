/**
 * approvals.ts — 指示書承認の共通ヘルパ。server-only.
 *
 * §6 の簡易版: 承認可否は approval_group_members のメンバーシップで判定し、
 * 遷移は work_orders の列 + history Json（MaterialPurchaseOrder と同型）に
 * 記録する。代理・承認依頼レコードは §6 本実装時に拡張。
 */

import type { ApprovalGroupType } from "../../generated/client/client";
import { getCurrentActorId } from "./audit";
import { prisma } from "./db";
import { notify, notifyGroup } from "./notifications";

/**
 * actor が type の承認権限を持つか（本人メンバー or 有効期間内の代理）。
 * 代理の場合は原承認者（delegateFor）を返す — approval_records の
 * delegate_for_id に記録する。
 */
export async function resolveApprover(
  type: ApprovalGroupType,
  userId?: string | null,
): Promise<{ ok: boolean; delegateForId: string | null }> {
  const actor = userId ?? (await getCurrentActorId());
  if (!actor) return { ok: false, delegateForId: null };

  const direct = await prisma.approvalGroupMember.count({
    where: { userId: actor, isActive: true, group: { type, isActive: true } },
  });
  if (direct > 0) return { ok: true, delegateForId: null };

  // 期間限定代理: delegator がそのグループの有効メンバーであること
  const now = new Date();
  const delegation = await prisma.approvalDelegate.findFirst({
    where: {
      delegateId: actor,
      validFrom: { lte: now },
      validUntil: { gte: now },
      group: { type, isActive: true },
      delegator: {
        approvalGroupMembers: {
          some: { isActive: true, group: { type, isActive: true } },
        },
      },
    },
    select: { delegatorId: true },
  });
  if (delegation) return { ok: true, delegateForId: delegation.delegatorId };
  return { ok: false, delegateForId: null };
}

/** actor が type の有効な承認グループのメンバー（or 代理）か。 */
export async function isApprover(
  type: ApprovalGroupType,
  userId?: string | null,
): Promise<boolean> {
  return (await resolveApprover(type, userId)).ok;
}

export interface HistoryEntry {
  action: string;
  user: string | null;
  at: string; // ISO
  notes?: string;
}

/** history Json 配列への追記（不正形は作り直す）。 */
export function appendHistory(
  history: unknown,
  entry: HistoryEntry,
): HistoryEntry[] {
  const list = Array.isArray(history) ? (history as HistoryEntry[]) : [];
  return [...list, entry];
}

// ─── 承認依頼・記録（§6 本実装） ─────────────────────────────────────────────
//
// 対象は多態: targetType = @@map 名 / targetId = 業務キー（audit と同じ規約）。
// 既存の行ワークフロー（work_orders / material_purchase_orders の遷移列）は
// 維持し、依頼・記録をここに正規化して PD03 で横断表示する。

export type ApprovalTargetType =
  | "work_orders"
  | "material_purchase_orders"
  | "order_acceptances";

export type ApprovalStepKind = "FIRST" | "SECOND";

const TARGET_LABELS: Record<ApprovalTargetType, string> = {
  work_orders: "指示書",
  material_purchase_orders: "素材発注書",
  order_acceptances: "受注請書",
};

const STEP_LABELS: Record<ApprovalStepKind, string> = {
  FIRST: "第一承認",
  SECOND: "第二承認",
};

/** 承認依頼を作成（同一対象・同一段の PENDING 重複は再利用）。 */
export async function createApprovalRequest(input: {
  targetType: ApprovalTargetType;
  targetId: string;
  step: ApprovalStepKind;
  notes?: string;
}): Promise<string> {
  const actor = await getCurrentActorId();
  const existing = await prisma.approvalRequest.findFirst({
    where: {
      targetType: input.targetType,
      targetId: input.targetId,
      step: input.step,
      status: "PENDING",
    },
    select: { id: true },
  });
  if (existing) return existing.id;
  const row = await prisma.approvalRequest.create({
    data: {
      targetType: input.targetType,
      targetId: input.targetId,
      step: input.step,
      requestedBy: actor,
      notes: input.notes,
    },
    select: { id: true },
  });
  // 承認グループ（本人 + 期間内代理）へ通知 — 失敗しても依頼は成立させる
  try {
    await notifyGroup(input.step === "FIRST" ? "FIRST" : "SECOND", {
      type: "APPROVAL_REQUEST",
      title: `${TARGET_LABELS[input.targetType]} ${input.targetId} の${STEP_LABELS[input.step]}依頼`,
      message: input.notes ?? undefined,
      linkPath: "/production/approvals",
    });
  } catch (e) {
    console.error("[approvals] 承認依頼通知に失敗:", e);
  }
  return row.id;
}

/**
 * 承認依頼へ記録を付けて確定する（APPROVED / REJECTED）。
 * groupType の権限（本人 or 代理）を検証し、代理なら原承認者を記録。
 */
export async function actOnApprovalRequest(input: {
  targetType: ApprovalTargetType;
  targetId: string;
  step: ApprovalStepKind;
  groupType: ApprovalGroupType;
  action: "APPROVED" | "REJECTED";
  comment?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const actor = await getCurrentActorId();
  const auth = await resolveApprover(input.groupType, actor);
  if (!auth.ok || !actor) {
    return { ok: false, error: "承認権限がありません（代理設定も未該当）" };
  }
  const request = await prisma.approvalRequest.findFirst({
    where: {
      targetType: input.targetType,
      targetId: input.targetId,
      step: input.step,
      status: "PENDING",
    },
    select: { id: true, requestedBy: true },
  });
  // 依頼行が無い旧データは作ってから確定（後方互換）
  const requestId =
    request?.id ??
    (await createApprovalRequest({
      targetType: input.targetType,
      targetId: input.targetId,
      step: input.step,
    }));

  await prisma.$transaction([
    prisma.approvalRecord.create({
      data: {
        approvalRequestId: requestId,
        approverId: actor,
        delegateForId: auth.delegateForId,
        action: input.action,
        comment: input.comment,
      },
    }),
    prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: input.action },
    }),
  ]);
  // 依頼者へ結果を通知（自己承認は通知しない）
  if (request?.requestedBy && request.requestedBy !== actor) {
    try {
      await notify({
        userIds: [request.requestedBy],
        type: "APPROVAL_RESULT",
        title: `${TARGET_LABELS[input.targetType]} ${input.targetId} が${
          input.action === "APPROVED" ? "承認されました" : "差し戻されました"
        }（${STEP_LABELS[input.step]}）`,
        message: input.comment ?? undefined,
        linkPath: "/production/approvals",
      });
    } catch (e) {
      console.error("[approvals] 承認結果通知に失敗:", e);
    }
  }
  return { ok: true };
}

/** 対象の承認記録（依頼 + 記録、承認者名解決済み）を取得。 */
export async function fetchApprovalTrail(
  targetType: ApprovalTargetType,
  targetId: string,
): Promise<
  {
    step: ApprovalStepKind;
    status: string;
    requestedAt: string;
    records: {
      approver: string;
      delegateFor: string | null;
      action: string;
      comment: string | null;
      actedAt: string;
    }[];
  }[]
> {
  const rows = await prisma.approvalRequest.findMany({
    where: { targetType, targetId },
    include: {
      records: {
        include: {
          approver: { select: { displayName: true } },
          delegateFor: { select: { displayName: true } },
        },
        orderBy: { actedAt: "asc" },
      },
    },
    orderBy: { requestedAt: "asc" },
  });
  return rows.map((r) => ({
    step: r.step,
    status: r.status,
    requestedAt: r.requestedAt.toISOString(),
    records: r.records.map((rec) => ({
      approver: rec.approver.displayName,
      delegateFor: rec.delegateFor?.displayName ?? null,
      action: rec.action,
      comment: rec.comment,
      actedAt: rec.actedAt.toISOString(),
    })),
  }));
}
