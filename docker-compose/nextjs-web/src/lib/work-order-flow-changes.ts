/**
 * work-order-flow-changes.ts — 工程フロー変更の承認（保留 → 承認 → 適用）。
 *
 * 承認済み・進行中の指示書で分岐を足す/直す/消す操作は、現場の段取りを変える。
 * **承認設定（MS0B）に「工程フロー変更」の段が 1 つでもあれば承認を通す**。
 * 1 段も無ければ何も保留せず即適用する（未設定 = 素通し）。
 *
 * 承認は**変更を止める**: 依頼時点では工程を一切触らず、やろうとした操作を
 * work_order_flow_changes に保留し、最終承認で初めて適用する。差し戻し・取消は
 * 適用せずに終わる。適用は承認後にサーバーで**再検証**してから走るので、
 * 承認待ちの間に前提が崩れていれば（分岐可能数が減った等）FAILED で残る
 * ——黙って古い前提のまま当てない。
 */

import "server-only";

import { getApprovalFlow, startApprovalFlow } from "./approvals";
import { getCurrentActorId, recordAudit } from "./audit";
import { prisma } from "./db";
import {
  describeFlowChange,
  type FlowChangeKind,
  isFlowChangeGated,
  requiresApproval,
} from "./flow-change-core";
import {
  addBranchSeries,
  type BranchTermination,
  removeBranchSeries,
  updateBranchSeries,
} from "./workflow";

const TARGET_TYPE = "work_order_flow_changes" as const;

export interface FlowChangeResult {
  ok: boolean;
  errors?: string[];
  /** true = 承認待ちとして保留した（工程はまだ変わっていない）。 */
  pending?: boolean;
}

/** 保留する操作の中身（Server Action の入力そのもの）。 */
export type FlowChangePayload =
  | {
      kind: "ADD_BRANCH";
      sourceStepId: string;
      catalogStepIds: number[];
      routedQuantity: number;
      termination: BranchTermination;
    }
  | {
      kind: "UPDATE_BRANCH";
      headStepId: string;
      routedQuantity?: number;
      termination: BranchTermination;
    }
  | { kind: "REMOVE_BRANCH"; headStepId: string };

/**
 * 工程フロー変更の入口。承認が要るなら保留 + 承認依頼、要らないなら即適用。
 * 呼び出し側（Server Action）は結果の `pending` を見て文言を変えるだけでよい。
 */
export async function submitFlowChange(input: {
  workOrderId: string;
  workOrderNumber: number;
  workOrderStatus: string;
  payload: FlowChangePayload;
}): Promise<FlowChangeResult> {
  const { workOrderId, workOrderNumber, workOrderStatus, payload } = input;

  // 下書き・承認前の指示書は普通の編集なので承認を挟まない。
  const gated = isFlowChangeGated(workOrderStatus);
  const flow = gated ? await getApprovalFlow(TARGET_TYPE) : [];
  if (!gated || !requiresApproval(flow.length)) {
    return applyPayload(workOrderId, payload);
  }

  // 進行中の変更は 1 指示書に 1 件だけ（DB 側にも部分 unique index がある）。
  const existing = await prisma.workOrderFlowChange.findFirst({
    where: { workOrderId, status: "PENDING" },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      errors: ["この指示書には承認待ちの工程フロー変更があります"],
    };
  }

  const actor = await getCurrentActorId();
  const row = await prisma.workOrderFlowChange.create({
    data: {
      workOrderId,
      kind: payload.kind,
      payload: payload as unknown as object,
      requestedBy: actor,
    },
    select: { id: true },
  });

  const started = await startApprovalFlow({
    targetType: TARGET_TYPE,
    targetId: row.id,
  });
  if (!started.ok) {
    // 依頼が作れないなら保留行も残さない（承認できない幽霊を作らない）。
    await prisma.workOrderFlowChange.delete({ where: { id: row.id } });
    return { ok: false, errors: [started.error ?? "承認依頼に失敗しました"] };
  }

  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(workOrderNumber),
    after: {
      note: `工程フロー変更を承認依頼（${describeFlowChange(payload.kind, payload)}）`,
    },
  });
  return { ok: true, pending: true };
}

/**
 * 承認が完了した変更を実際に当てる。承認待ちの間に前提が変わっている
 * ことがあるので、適用は通常の操作と同じ関数を通す（= 同じ検証を受ける）。
 */
export async function applyApprovedFlowChange(
  flowChangeId: string,
): Promise<FlowChangeResult> {
  const row = await prisma.workOrderFlowChange.findUnique({
    where: { id: flowChangeId },
    include: { workOrder: { select: { id: true, workOrderNumber: true } } },
  });
  if (!row) return { ok: false, errors: ["工程フロー変更が見つかりません"] };
  if (row.status !== "PENDING") {
    return { ok: false, errors: ["この変更は既に処理済みです"] };
  }

  const actor = await getCurrentActorId();
  const result = await applyPayload(
    row.workOrderId,
    row.payload as unknown as FlowChangePayload,
  );

  await prisma.workOrderFlowChange.update({
    where: { id: row.id },
    data: {
      status: result.ok ? "APPLIED" : "FAILED",
      error: result.ok ? null : (result.errors?.join(" / ") ?? "適用に失敗"),
      resolvedBy: actor,
      resolvedAt: new Date(),
    },
  });

  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(row.workOrder.workOrderNumber),
    after: {
      note: result.ok
        ? `工程フロー変更を適用（${describeFlowChange(row.kind, row.payload)}）`
        : `工程フロー変更の適用に失敗（${result.errors?.join(" / ")}）`,
    },
  });
  return result;
}

/** 差し戻し・取消で保留を閉じる（工程は触らない）。 */
export async function closeFlowChange(
  flowChangeId: string,
  status: "REJECTED" | "CANCELLED",
): Promise<void> {
  const actor = await getCurrentActorId();
  await prisma.workOrderFlowChange.updateMany({
    where: { id: flowChangeId, status: "PENDING" },
    data: { status, resolvedBy: actor, resolvedAt: new Date() },
  });
}

/** 指示書の保留中の変更（無ければ null）。 */
export async function fetchPendingFlowChange(workOrderId: string): Promise<{
  id: string;
  kind: string;
  summary: string;
  requestedByName: string | null;
  requestedAt: string;
} | null> {
  const row = await prisma.workOrderFlowChange.findFirst({
    where: { workOrderId, status: "PENDING" },
    include: { requestedByUser: { select: { displayName: true } } },
    orderBy: { requestedAt: "desc" },
  });
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    summary: describeFlowChange(row.kind, row.payload),
    requestedByName: row.requestedByUser?.displayName ?? null,
    requestedAt: row.requestedAt.toISOString(),
  };
}

/** 保留内容 → 実際の操作。承認の有無に依らずここだけが工程を触る。 */
async function applyPayload(
  workOrderId: string,
  payload: FlowChangePayload,
): Promise<FlowChangeResult> {
  switch (payload.kind) {
    case "ADD_BRANCH":
      return addBranchSeries({
        workOrderId,
        sourceStepId: payload.sourceStepId,
        catalogStepIds: payload.catalogStepIds,
        routedQuantity: payload.routedQuantity,
        termination: payload.termination,
      });
    case "UPDATE_BRANCH":
      return updateBranchSeries({
        workOrderId,
        headStepId: payload.headStepId,
        routedQuantity: payload.routedQuantity,
        termination: payload.termination,
      });
    case "REMOVE_BRANCH":
      return removeBranchSeries({
        workOrderId,
        headStepId: payload.headStepId,
      });
    default: {
      const kind = (payload as { kind?: string }).kind ?? "unknown";
      return { ok: false, errors: [`未知の変更種別です（${kind}）`] };
    }
  }
}

export type { FlowChangeKind };
