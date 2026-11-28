/**
 * work-order-aborts.ts — 指示書の打ち切り（申請 → 承認 → 適用）。server-only.
 *
 * 進行中の指示書を止め、流れの途中にある良品を仕掛品として在庫へ戻す。
 * 形は工程フロー変更（lib/work-order-flow-changes.ts）と同じ:
 *
 * - **承認設定（MS0B）の「指示書の打ち切り」に段が 1 つでもあれば承認を通す。**
 *   申請時点では何も動かさず work_order_aborts に保留し、最終承認で適用する。
 *   1 段も無ければ申請と同時に適用する（未設定 = 素通し）。
 * - **適用はいまの工程の状態で計算し直して突き合わせる**（wip-abort-core
 *   abortPremiseIssues）。承認を待つあいだに現場が工程を進めていれば適用せず、
 *   FAILED + 理由で残す — 古い数のまま戻すと在庫が二重になる。
 * - 計上は指示書の完了と同じ道（lib/inventory.ts onWorkOrderAbortedTx）。
 *
 * 打ち切った指示書の status は CANCELLED、印は work_orders.aborted_at。
 * 新しい状態値を足さないのは、終わった指示書としての扱い（割当の解放・再計画・
 * 現場の一覧から外す・旧アプリの読み方）がキャンセルとまったく同じだから。
 */

import "server-only";

import { getTranslations } from "next-intl/server";
import { appendHistory, approvalNeed, startApprovalFlow } from "./approvals";
import { getCurrentActorId, recordAudit } from "./audit";
import { type Prisma, prisma } from "./db";
import { type LocalizedText, localized } from "./format";
import type { Locale, Tr } from "./i18n";
import { onWorkOrderAbortedTx, workOrderWipBlankTx } from "./inventory";
import {
  type AbortIssue,
  type AbortPosition,
  type AbortPositionInput,
  type AbortPremiseIssue,
  abortBlock,
  abortPositions,
  abortPremiseIssues,
  abortSettlement,
  parseAbortPayload,
  validateAbortRequest,
  type WorkOrderAbortPayload,
} from "./wip-abort-core";
import {
  STEP_LINK_STATE_SELECT,
  STEP_STATE_SELECT,
  toStepState,
} from "./workflow-core";

const TARGET_TYPE = "work_order_aborts" as const;

type Db = Prisma.TransactionClient | typeof prisma;

export interface AbortResult {
  ok: boolean;
  errors?: string[];
  /** true = 承認依頼中として保留した（何も動いていない）。 */
  pending?: boolean;
  /** true = 適用した（指示書は打ち切られた）。 */
  applied?: boolean;
}

/** 画面に渡す打ち切りの材料（シリアライズ可能）。 */
export interface AbortFormView {
  /** 打ち切れない理由（null = 打ち切れる）。 */
  block: "notInProgress" | "typeNotAbortable" | "pending" | null;
  positions: AbortPosition[];
  /** 仕掛ブランクの寸法（形を変える工程が済んでいない品の既定）。 */
  blank: { diameterMm: number; lengthMm: number } | null;
  /** 指示書の工程 id → カタログ id（位置の工程名を引く）。 */
  stepProcessIds: Record<string, number>;
  /** カタログ id → 工程名（閲覧者の言語。加工状態のラベルを組む）。 */
  stepNames: Record<number, string>;
}

async function readWorkOrder(db: Db, where: { id: string }) {
  return db.workOrder.findUnique({
    where,
    select: {
      id: true,
      workOrderNumber: true,
      status: true,
      type: true,
      plannedQuantity: true,
      productItemId: true,
      materialItemId: true,
      history: true,
      startWipState: { select: { stepIds: true } },
      steps: {
        select: {
          ...STEP_STATE_SELECT,
          processStep: { select: { affectsWipState: true, name: true } },
        },
      },
      stepLinks: { select: STEP_LINK_STATE_SELECT },
    },
  });
}

type WoRow = NonNullable<Awaited<ReturnType<typeof readWorkOrder>>>;

function positionsOf(wo: WoRow): AbortPosition[] {
  const affects = new Map(
    wo.steps.map((s) => [s.processStepId, s.processStep.affectsWipState]),
  );
  return abortPositions(
    wo.steps.map(toStepState),
    wo.stepLinks,
    (id) => affects.get(id) ?? false,
    {
      startStepIds: wo.startWipState?.stepIds ?? [],
      plannedQuantity: wo.plannedQuantity,
    },
  );
}

async function blankOf(
  db: Db,
  wo: WoRow,
): Promise<{ diameterMm: number; lengthMm: number } | null> {
  const blank = await workOrderWipBlankTx(db, wo);
  return blank
    ? { diameterMm: blank.size.diameterMm, lengthMm: blank.size.lengthMm }
    : null;
}

/** 指示書詳細の打ち切りフォームの材料。 */
export async function loadAbortForm(
  workOrderId: string,
  locale: Locale,
): Promise<AbortFormView | null> {
  const wo = await readWorkOrder(prisma, { id: workOrderId });
  if (!wo) return null;
  const pending = await prisma.workOrderAbort.findFirst({
    where: { workOrderId, status: "PENDING" },
    select: { id: true },
  });
  const block = pending ? "pending" : abortBlock(wo);
  const stepNames: Record<number, string> = {};
  const stepProcessIds: Record<string, number> = {};
  for (const s of wo.steps) {
    stepNames[s.processStepId] = localized(
      s.processStep.name as LocalizedText | null,
      locale,
    );
    stepProcessIds[s.id] = s.processStepId;
  }
  const positions = block ? [] : positionsOf(wo);
  // 加工状態には指示書に載っていない工程も入る（在庫の仕掛品から始めた
  // 指示書の開始状態 — 済んでいた工程は作成時に落としてある）。名前はカタログから。
  const missing = new Set<number>();
  for (const p of positions) {
    for (const ids of [p.path.stepIds, ...p.path.alternatives]) {
      for (const id of ids) if (!(id in stepNames)) missing.add(id);
    }
  }
  if (missing.size > 0) {
    const rows = await prisma.processStepCatalog.findMany({
      where: { id: { in: [...missing] } },
      select: { id: true, name: true },
    });
    for (const r of rows) {
      stepNames[r.id] = localized(r.name as LocalizedText | null, locale);
    }
  }
  return {
    block,
    positions,
    blank: block ? null : await blankOf(prisma, wo),
    stepProcessIds,
    stepNames,
  };
}

/** 検証の不備を文言にする（位置は「工程名」で言う）。 */
export function abortIssueMessages(
  issues: readonly AbortIssue[],
  tr: Tr,
): string[] {
  return issues.map((i) => {
    switch (i.kind) {
      case "reasonRequired":
        return tr("production.workOrderAbort.reasonRequired");
      case "positionMissing":
      case "positionUnknown":
        return tr("production.workOrderAbort.positionsChanged");
      case "quantityInvalid":
      case "quantityMismatch":
        return tr("production.workOrderAbort.quantityMismatch");
      default:
        return tr(`production.wipRecording.issues.${i.issue}`);
    }
  });
}

function premiseMessage(issues: readonly AbortPremiseIssue[], tr: Tr): string {
  return tr("production.workOrderAbort.premiseChanged", {
    count: issues.length,
  });
}

/**
 * 打ち切りの申請。承認が要るなら保留 + 承認依頼、要らないなら即適用。
 * 理由は承認の有無に関わらず必須。
 */
export async function submitWorkOrderAbort(input: {
  workOrderId: string;
  reason: string;
  inputs: AbortPositionInput[];
}): Promise<AbortResult> {
  const tr = await getTranslations();
  const wo = await readWorkOrder(prisma, { id: input.workOrderId });
  if (!wo) {
    return {
      ok: false,
      errors: [tr("production.workOrderActions.workOrderNotFound")],
    };
  }
  const block = abortBlock(wo);
  if (block) {
    return {
      ok: false,
      errors: [tr(`production.workOrderAbort.block.${block}`)],
    };
  }
  const existing = await prisma.workOrderAbort.findFirst({
    where: { workOrderId: wo.id, status: "PENDING" },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      errors: [tr("production.workOrderAbort.block.pending")],
    };
  }

  const reason = input.reason.trim();
  const { issues, payload } = validateAbortRequest({
    positions: positionsOf(wo),
    reason,
    inputs: input.inputs,
    blank: await blankOf(prisma, wo),
  });
  if (!payload) return { ok: false, errors: abortIssueMessages(issues, tr) };

  const need = await approvalNeed(TARGET_TYPE);
  if (need.kind === "blocked") return { ok: false, errors: [need.error] };

  const actor = await getCurrentActorId();
  const row = await prisma.workOrderAbort.create({
    data: {
      workOrderId: wo.id,
      reason,
      payload: payload as unknown as Prisma.InputJsonValue,
      requestedBy: actor,
    },
    select: { id: true },
  });

  if (need.kind === "skip") {
    // 承認設定に段が無い — 申請と同時に適用する（申請の行は記録として残る）。
    return applyWorkOrderAbort(row.id);
  }

  const started = await startApprovalFlow({
    targetType: TARGET_TYPE,
    targetId: row.id,
  });
  if (!started.ok) {
    // 依頼が作れないなら保留行も残さない（承認できない幽霊を作らない）。
    await prisma.workOrderAbort.delete({ where: { id: row.id } });
    return {
      ok: false,
      errors: [
        started.error ??
          tr("production.workOrderFlowChanges.approvalRequestFailedFallback"),
      ],
    };
  }
  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(wo.workOrderNumber),
    after: {
      note: tr("production.workOrderAbort.requestedNote", { reason }),
      abort: payload as unknown as Record<string, unknown>,
    },
  });
  return { ok: true, pending: true };
}

/** 適用を止める理由（トランザクションを巻き戻してから FAILED に残す）。 */
class AbortApplyError extends Error {}

/**
 * 打ち切りを適用する（最終承認のとき / 承認が要らないときは申請の直後）。
 *
 * 1 トランザクション: 指示書の遷移（条件付き — 進行中でなくなっていたら負ける）
 * → 計上（完了と同じ道）→ 残りの工程を閉じる → 注文明細を再計画できる形に戻す。
 * 前提が崩れていれば何も動かさず FAILED + 理由。
 */
export async function applyWorkOrderAbort(
  abortId: string,
): Promise<AbortResult> {
  const tr = await getTranslations();
  const actor = await getCurrentActorId();
  const row = await prisma.workOrderAbort.findUnique({
    where: { id: abortId },
    select: { id: true, status: true, reason: true, payload: true },
  });
  if (!row) {
    return { ok: false, errors: [tr("production.workOrderAbort.notFound")] };
  }
  if (row.status !== "PENDING") {
    return {
      ok: false,
      errors: [tr("production.workOrderAbort.alreadyProcessed")],
    };
  }

  let summary: {
    workOrderNumber: number;
    payload: WorkOrderAbortPayload;
    returned: number;
    scrap: number;
    lotCleared: number;
  };
  try {
    summary = await prisma.$transaction(
      async (tx) => {
        const lockedRow = await tx.workOrderAbort.findUniqueOrThrow({
          where: { id: abortId },
          select: { status: true, workOrderId: true },
        });
        if (lockedRow.status !== "PENDING") {
          throw new AbortApplyError(
            tr("production.workOrderAbort.alreadyProcessed"),
          );
        }
        const payload = parseAbortPayload(row.payload);
        if (!payload) {
          throw new AbortApplyError(
            tr("production.workOrderAbort.payloadBroken"),
          );
        }
        const wo = await readWorkOrder(tx, { id: lockedRow.workOrderId });
        if (!wo) {
          throw new AbortApplyError(
            tr("production.workOrderActions.workOrderNotFound"),
          );
        }
        const block = abortBlock(wo);
        if (block) {
          throw new AbortApplyError(
            tr(`production.workOrderAbort.block.${block}`),
          );
        }
        const premise = abortPremiseIssues(payload, positionsOf(wo));
        if (premise.length > 0) {
          throw new AbortApplyError(premiseMessage(premise, tr));
        }

        const now = new Date();
        // 遷移は条件付き — 読んだあとに完了・巻き戻しが走っていたら負ける。
        const flipped = await tx.workOrder.updateMany({
          where: { id: wo.id, status: "IN_PROGRESS" },
          data: {
            status: "CANCELLED",
            abortedAt: now,
            history: appendHistory(wo.history, {
              action: "ABORT",
              user: actor,
              at: now.toISOString(),
              notes: row.reason,
            }) as unknown as Prisma.InputJsonValue,
          },
        });
        if (flipped.count !== 1) {
          throw new AbortApplyError(
            tr("production.workOrderAbort.block.notInProgress"),
          );
        }

        // 計上は工程を閉じる**前**に — 完成数・半製品の発生元はいまの工程の
        // 状態から数える（未着手の工程を先に閉じると、その手前の工程が
        // 終端に見えて完成品として入ってしまう）。
        const settlement = abortSettlement(payload);
        await onWorkOrderAbortedTx(tx, wo.id, settlement);

        // 残りの工程を閉じる（ロックも外す）。実績の開いている行は今で閉じる。
        await tx.workOrderStep.updateMany({
          where: {
            workOrderId: wo.id,
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
          data: {
            status: "CANCELLED",
            cancelledAt: now,
            cancelledBy: actor,
            cancelReason: row.reason,
            sessionLockedBy: null,
            sessionLockedAt: null,
          },
        });
        await tx.workOrderStepActual.updateMany({
          where: {
            step: { workOrderId: wo.id },
            startedAt: { not: null },
            endedAt: null,
          },
          data: { endedAt: now },
        });

        // 保留中の工程フロー変更は当てる先が無くなった — 取り下げる。
        const flowChanges = await tx.workOrderFlowChange.findMany({
          where: { workOrderId: wo.id, status: "PENDING" },
          select: { id: true },
        });
        if (flowChanges.length > 0) {
          await tx.workOrderFlowChange.updateMany({
            where: { id: { in: flowChanges.map((c) => c.id) } },
            data: { status: "CANCELLED", resolvedBy: actor, resolvedAt: now },
          });
          await tx.approvalRequest.deleteMany({
            where: {
              targetType: "work_order_flow_changes",
              targetId: { in: flowChanges.map((c) => c.id) },
              status: "PENDING",
            },
          });
        }

        // 注文明細を再計画できる形に戻す（キャンセルと同じ規則）。割当行は
        // 残る（履歴）が、打ち切った指示書は CANCELLED なので割当の数には
        // 入らない — 明細は未手配に戻り、新しい指示書を起こせる。
        const links = await tx.workOrderOrderLine.findMany({
          where: { workOrderId: wo.id },
          select: { orderLineId: true },
        });
        const lineIds = links.map((l) => l.orderLineId);
        if (lineIds.length > 0) {
          await tx.orderLine.updateMany({
            where: { id: { in: lineIds } },
            data: { isLocked: false },
          });
          const stillAllocated = await tx.workOrderOrderLine.findMany({
            where: {
              orderLineId: { in: lineIds },
              workOrder: { id: { not: wo.id }, status: { not: "CANCELLED" } },
            },
            select: { orderLineId: true },
          });
          const keep = new Set(stillAllocated.map((l) => l.orderLineId));
          const revert = lineIds.filter((id) => !keep.has(id));
          if (revert.length > 0) {
            await tx.orderLine.updateMany({
              where: { id: { in: revert }, status: "IN_PRODUCTION" },
              data: { status: "CONFIRMED" },
            });
          }
        }
        const lot = await tx.orderLine.updateMany({
          where: { lotNumber: wo.workOrderNumber },
          data: { lotNumber: null },
        });

        await tx.workOrderAbort.update({
          where: { id: abortId },
          data: {
            status: "APPLIED",
            appliedAt: now,
            error: null,
            resolvedBy: actor,
            resolvedAt: now,
          },
        });
        return {
          workOrderNumber: wo.workOrderNumber,
          payload,
          returned: settlement.returned,
          scrap: settlement.scrap,
          lotCleared: lot.count,
        };
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    if (!(e instanceof AbortApplyError)) throw e;
    await prisma.workOrderAbort.updateMany({
      where: { id: abortId, status: "PENDING" },
      data: {
        status: "FAILED",
        error: e.message,
        resolvedBy: actor,
        resolvedAt: new Date(),
      },
    });
    const wo = await prisma.workOrderAbort.findUnique({
      where: { id: abortId },
      select: { workOrder: { select: { workOrderNumber: true } } },
    });
    if (wo) {
      await recordAudit({
        action: "UPDATE",
        tableName: "work_orders",
        recordId: String(wo.workOrder.workOrderNumber),
        after: {
          note: tr("production.workOrderAbort.applyFailedNote", {
            error: e.message,
          }),
        },
      });
    }
    return { ok: false, errors: [e.message] };
  }

  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(summary.workOrderNumber),
    before: { status: "IN_PROGRESS" },
    after: {
      status: "CANCELLED",
      note: tr("production.workOrderAbort.appliedNote", {
        reason: row.reason,
        returned: summary.returned,
        scrap: summary.scrap,
      }),
      abort: summary.payload as unknown as Record<string, unknown>,
      lotCleared: summary.lotCleared,
    },
  });
  return { ok: true, applied: true };
}

/** 差し戻し・取り下げで保留を閉じる（何も動かさない）。 */
export async function closeWorkOrderAbort(
  abortId: string,
  status: "REJECTED" | "CANCELLED",
): Promise<void> {
  const actor = await getCurrentActorId();
  await prisma.workOrderAbort.updateMany({
    where: { id: abortId, status: "PENDING" },
    data: { status, resolvedBy: actor, resolvedAt: new Date() },
  });
}

/** 指示書詳細のカードに出す申請（保留中 / 適用済み / 適用できなかった）。 */
export interface WorkOrderAbortView {
  id: string;
  status: string;
  reason: string;
  error: string | null;
  requestedByName: string | null;
  requestedAt: string;
  appliedAt: string | null;
  returned: number;
  scrap: number;
}

/**
 * 指示書の申請のうち画面に出すもの: 保留中があればそれ、無ければ最新の
 * 適用済み（打ち切った指示書）または最新の失敗（まだ進行中の指示書で、
 * 適用できなかったことを知らせる）。
 */
export async function fetchWorkOrderAbortView(
  workOrderId: string,
): Promise<WorkOrderAbortView | null> {
  const rows = await prisma.workOrderAbort.findMany({
    where: { workOrderId, status: { in: ["PENDING", "APPLIED", "FAILED"] } },
    include: { requestedByUser: { select: { displayName: true } } },
    orderBy: { requestedAt: "desc" },
    take: 5,
  });
  const row =
    rows.find((r) => r.status === "PENDING") ??
    rows.find((r) => r.status === "APPLIED") ??
    rows[0];
  if (!row) return null;
  const payload = parseAbortPayload(row.payload);
  const totals = payload
    ? abortSettlement(payload)
    : { returned: 0, scrap: 0, postings: [] };
  return {
    id: row.id,
    status: row.status,
    reason: row.reason,
    error: row.error,
    requestedByName: row.requestedByUser?.displayName ?? null,
    requestedAt: row.requestedAt.toISOString(),
    appliedAt: row.appliedAt?.toISOString() ?? null,
    returned: totals.returned,
    scrap: totals.scrap,
  };
}
