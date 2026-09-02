/**
 * work-order-flow-changes.ts — 工程フロー変更の承認（保留 → 承認 → 適用）。
 *
 * 承認済み・進行中の指示書で分岐を足す/直す/消す操作は、現場の段取りを変える。
 * **承認設定（MS0B）に「工程フロー変更」の段が 1 つでもあれば承認を通す**。
 * 1 段も無ければ何も保留せず即適用する（未設定 = 素通し）。
 *
 * 適用のタイミングは承認フロー設定（approval_flows.apply_mode）で選ぶ:
 * - PRE（既定）: 承認は**変更を止める** — 依頼時点では工程を一切触らず、
 *   やろうとした操作を work_order_flow_changes に保留し、最終承認で初めて
 *   適用する。差し戻し・取消は適用せずに終わる。適用は承認後にサーバーで
 *   **再検証**してから走るので、承認依頼中の間に前提が崩れていれば FAILED で
 *   残る ——黙って古い前提のまま当てない。
 * - POST: **即時適用 + 事後承認** — 変更をその場で適用してから承認依頼を出す
 *   （現場を止めない運用）。差し戻されても工程は自動では戻らない — 指示書
 *   詳細に赤アラートを出し、人が確認（acknowledge）して手で直す。
 */

import "server-only";

import { getTranslations } from "next-intl/server";
import {
  getApprovalApplyMode,
  getApprovalFlow,
  startApprovalFlow,
} from "./approvals";
import { getCurrentActorId, recordAudit } from "./audit";
import { prisma } from "./db";
import {
  describeFlowChange,
  type FlowChangeKind,
  isFlowChangeGated,
  isPostApply,
  requiresApproval,
} from "./flow-change-core";
import type { Tr } from "./i18n";
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
  /** true = 承認依頼中として保留した（工程はまだ変わっていない）。 */
  pending?: boolean;
  /** true = 即時適用した（事後承認 POST — 承認は別途進行中）。 */
  applied?: boolean;
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
  const tr = await getTranslations();

  // 下書き・承認前の指示書は普通の編集なので承認を挟まない。
  const gated = isFlowChangeGated(workOrderStatus);
  const flow = gated ? await getApprovalFlow(TARGET_TYPE) : [];
  if (!gated || !requiresApproval(flow.length)) {
    return applyPayload(workOrderId, payload, tr);
  }

  // 進行中の変更は 1 指示書に 1 件だけ（DB 側にも部分 unique index がある）。
  const existing = await prisma.workOrderFlowChange.findFirst({
    where: { workOrderId, status: "PENDING" },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      errors: [
        tr("production.workOrderFlowChanges.pendingChangeAlreadyExists"),
      ],
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

  // 適用モード POST = 即時適用 + 事後承認（現場を止めない運用）。
  const postApply = isPostApply(await getApprovalApplyMode(TARGET_TYPE));
  if (postApply) {
    const applied = await applyPayload(workOrderId, payload, tr);
    if (!applied.ok) {
      // 適用できない変更は保留も残さない — 依頼者がその場で直して出し直す。
      await prisma.workOrderFlowChange.delete({ where: { id: row.id } });
      return applied;
    }
    await prisma.workOrderFlowChange.update({
      where: { id: row.id },
      data: { appliedAt: new Date() },
    });
  }

  const started = await startApprovalFlow({
    targetType: TARGET_TYPE,
    targetId: row.id,
  });
  if (!started.ok) {
    if (postApply) {
      // 適用済みの事実は消せない — 行を APPLIED で確定し、承認が始められ
      // なかったことをメモに残す（幽霊 PENDING を作らない）。
      const reason = started.error ?? tr("common.unknownReason");
      await prisma.workOrderFlowChange.update({
        where: { id: row.id },
        data: {
          status: "APPLIED",
          error: tr("production.workOrderFlowChanges.approvalStartFailedNote", {
            error: reason,
          }),
          resolvedBy: actor,
          resolvedAt: new Date(),
        },
      });
      await recordAudit({
        action: "UPDATE",
        tableName: "work_orders",
        recordId: String(workOrderNumber),
        after: {
          note: tr(
            "production.workOrderFlowChanges.appliedApprovalStartFailedNote",
            { error: reason },
          ),
        },
      });
      return { ok: true, applied: true };
    }
    // PRE: 依頼が作れないなら保留行も残さない（承認できない幽霊を作らない）。
    await prisma.workOrderFlowChange.delete({ where: { id: row.id } });
    return {
      ok: false,
      errors: [
        started.error ??
          tr("production.workOrderFlowChanges.approvalRequestFailedFallback"),
      ],
    };
  }

  const summary = describeFlowChange(payload.kind, payload, tr);
  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(workOrderNumber),
    after: {
      note: postApply
        ? tr("production.workOrderFlowChanges.appliedWithApprovalNote", {
            summary,
          })
        : tr("production.workOrderFlowChanges.requestedApprovalNote", {
            summary,
          }),
    },
  });
  return postApply
    ? { ok: true, pending: true, applied: true }
    : { ok: true, pending: true };
}

/**
 * 承認が完了した変更を実際に当てる。承認依頼中の間に前提が変わっている
 * ことがあるので、適用は通常の操作と同じ関数を通す（= 同じ検証を受ける）。
 */
export async function applyApprovedFlowChange(
  flowChangeId: string,
): Promise<FlowChangeResult> {
  const tr = await getTranslations();
  const row = await prisma.workOrderFlowChange.findUnique({
    where: { id: flowChangeId },
    include: { workOrder: { select: { id: true, workOrderNumber: true } } },
  });
  if (!row) {
    return {
      ok: false,
      errors: [tr("production.workOrderFlowChanges.notFound")],
    };
  }
  if (row.status !== "PENDING") {
    return {
      ok: false,
      errors: [tr("production.workOrderFlowChanges.alreadyProcessed")],
    };
  }

  const actor = await getCurrentActorId();
  // 事後承認（POST）で既に適用済みなら再適用しない — 承認は状態遷移のみ。
  const result: FlowChangeResult =
    row.appliedAt != null
      ? { ok: true, applied: true }
      : await applyPayload(
          row.workOrderId,
          row.payload as unknown as FlowChangePayload,
          tr,
        );

  await prisma.workOrderFlowChange.update({
    where: { id: row.id },
    data: {
      status: result.ok ? "APPLIED" : "FAILED",
      error: result.ok
        ? null
        : (result.errors?.join(" / ") ??
          tr("production.workOrderFlowChanges.applyFailedShort")),
      resolvedBy: actor,
      resolvedAt: new Date(),
    },
  });

  const summary = describeFlowChange(row.kind, row.payload, tr);
  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(row.workOrder.workOrderNumber),
    after: {
      note: !result.ok
        ? tr("production.workOrderFlowChanges.applyFailedNote", {
            errors: result.errors?.join(" / ") ?? "",
          })
        : row.appliedAt != null
          ? tr("production.workOrderFlowChanges.approvedAlreadyAppliedNote", {
              summary,
            })
          : tr("production.workOrderFlowChanges.appliedNote", { summary }),
    },
  });
  return result;
}

/**
 * 差し戻し・取消で保留を閉じる（工程は触らない）。
 * 事後承認（POST）で適用済みの行は applied_at を保持したまま REJECTED になる —
 * 「差し戻されたが適用済み」の赤アラート対象（needsRejectedAppliedAlert）。
 */
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

/**
 * 「差し戻されたが適用済み・未確認」の変更を確認済みにする（人が手で直した
 * ことの記録）。対象外の行は何もしない。
 */
export async function acknowledgeFlowChange(
  flowChangeId: string,
): Promise<boolean> {
  const actor = await getCurrentActorId();
  const updated = await prisma.workOrderFlowChange.updateMany({
    where: {
      id: flowChangeId,
      status: "REJECTED",
      appliedAt: { not: null },
      acknowledgedAt: null,
    },
    data: { acknowledgedAt: new Date(), acknowledgedBy: actor },
  });
  return updated.count === 1;
}

/** 指示書の保留中の変更（無ければ null）。 */
export async function fetchPendingFlowChange(workOrderId: string): Promise<{
  id: string;
  kind: string;
  summary: string;
  requestedByName: string | null;
  requestedAt: string;
  /** 事後承認（POST）で即時適用済みの日時（PRE は null）。 */
  appliedAt: string | null;
} | null> {
  const row = await prisma.workOrderFlowChange.findFirst({
    where: { workOrderId, status: "PENDING" },
    include: { requestedByUser: { select: { displayName: true } } },
    orderBy: { requestedAt: "desc" },
  });
  if (!row) return null;
  const tr = await getTranslations();
  return {
    id: row.id,
    kind: row.kind,
    summary: describeFlowChange(row.kind, row.payload, tr),
    requestedByName: row.requestedByUser?.displayName ?? null,
    requestedAt: row.requestedAt.toISOString(),
    appliedAt: row.appliedAt?.toISOString() ?? null,
  };
}

/**
 * 「差し戻されたが適用済み・未確認」の変更（赤アラート用。無ければ null）。
 */
export async function fetchRejectedAppliedFlowChange(
  workOrderId: string,
): Promise<{
  id: string;
  summary: string;
  resolvedAt: string | null;
} | null> {
  const row = await prisma.workOrderFlowChange.findFirst({
    where: {
      workOrderId,
      status: "REJECTED",
      appliedAt: { not: null },
      acknowledgedAt: null,
    },
    orderBy: { resolvedAt: "desc" },
  });
  if (!row) return null;
  const tr = await getTranslations();
  return {
    id: row.id,
    summary: describeFlowChange(row.kind, row.payload, tr),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

/** 保留内容 → 実際の操作。承認の有無に依らずここだけが工程を触る。 */
async function applyPayload(
  workOrderId: string,
  payload: FlowChangePayload,
  tr: Tr,
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
      return {
        ok: false,
        errors: [
          tr("production.workOrderFlowChanges.unknownChangeKind", { kind }),
        ],
      };
    }
  }
}

export type { FlowChangeKind };
