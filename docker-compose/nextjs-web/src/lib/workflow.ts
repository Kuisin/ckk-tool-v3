/**
 * workflow.ts — 製造ワークフローの Prisma ラッパ。server-only.
 *
 * 純ロジックは lib/workflow-core.ts（構成検証・依存解決）。ここはカタログの
 * ロードと形変換のみ。実行系（startStep/completeStep 等）は PR 3 で追加。
 */

import { prisma } from "./db";
import { type LocalizedText, localized } from "./format";
import type { CatalogStep, ExecDep, UseDep } from "./workflow-core";

export interface WorkflowCatalog {
  steps: CatalogStep[];
  useDeps: UseDep[];
  execDeps: ExecDep[];
}

/** 工程カタログ + 依存の全ロード（ビルダー・検証用）。 */
export async function loadCatalog(): Promise<WorkflowCatalog> {
  const [steps, useDeps, execDeps] = await Promise.all([
    prisma.processStepCatalog.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.processStepUseDependency.findMany(),
    prisma.processStepExecDependency.findMany(),
  ]);
  return {
    steps: steps.map((s) => ({
      id: s.id,
      code: s.code,
      nameJa: localized(s.name as LocalizedText | null),
      category: s.category,
      executionLocation: s.executionLocation,
      isSyncCapable: s.isSyncCapable,
      isInspection: s.isInspection,
      isApprovalStep: s.isApprovalStep,
      quantityTracking: s.quantityTracking,
      defaultWorkHours:
        s.defaultWorkHours == null ? null : Number(s.defaultWorkHours),
      sortOrder: s.sortOrder,
    })),
    useDeps: useDeps.map((d) => ({
      stepId: d.stepId,
      dependsOnStepId: d.dependsOnStepId,
      relation: d.relation,
      isNegation: d.isNegation,
    })),
    execDeps: execDeps.map((d) => ({
      stepId: d.stepId,
      dependsOnStepId: d.dependsOnStepId,
      relation: d.relation,
    })),
  };
}

// ─── 工程構成の共通検証（指示書 / 製品工程ルートで共用） ─────────────────────

import { describeIssue } from "@/components/production/work-orders/model";
import {
  defaultOrder,
  isBlockingIssue,
  validateComposition,
} from "./workflow-core";

export interface StepCompositionInput {
  processStepId: number;
  executionLocation: "INTERNAL" | "OUTSOURCE";
  plantId: number | null;
  supplierBpId: string | null;
  /** 作業時間 (h) — 任意。指示書は planned_work_hours、ルートは work_hours へ。 */
  workHours: number | null;
}

export interface OrderedStepCreate extends StepCompositionInput {
  sortOrder: number;
}

/**
 * 工程構成のサーバー側検証 + カタログ既定順の並び。
 * 未知/重複工程・ブロッカー（AND 不足・排他違反）はエラーメッセージを返す。
 * 実施場所は INTERNAL → plantId / OUTSOURCE → supplierBpId のみ保持する。
 */
export async function validateAndOrderSteps(
  steps: readonly StepCompositionInput[],
): Promise<
  { ok: false; error: string } | { ok: true; creates: OrderedStepCreate[] }
> {
  const catalog = await loadCatalog();
  const ids = steps.map((s) => s.processStepId);
  const known = new Set(catalog.steps.map((s) => s.id));
  if (ids.some((id) => !known.has(id))) {
    return { ok: false, error: "存在しない工程が含まれています" };
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "同じ工程が重複しています" };
  }
  const blocking = validateComposition(ids, catalog.useDeps).filter(
    isBlockingIssue,
  );
  if (blocking.length > 0) {
    return {
      ok: false,
      error: blocking.map((i) => describeIssue(i, catalog.steps)).join(" / "),
    };
  }
  const byId = new Map(steps.map((s) => [s.processStepId, s]));
  const creates = defaultOrder(ids, catalog.steps).map((stepId, i) => {
    const s = byId.get(stepId);
    if (!s) throw new Error("step mapping failed");
    return {
      processStepId: stepId,
      sortOrder: i,
      executionLocation: s.executionLocation,
      plantId: s.executionLocation === "INTERNAL" ? s.plantId : null,
      supplierBpId: s.executionLocation === "OUTSOURCE" ? s.supplierBpId : null,
      workHours: s.workHours,
    };
  });
  return { ok: true, creates };
}

// ─── 実行系（§7）: 開始・完了・キャンセル・巻き戻し・分岐追加 ────────────────
//
// すべて lib/workflow-core.ts の純ロジックで検証してから永続化する。
// セッションロックの獲得は updateMany の WHERE 句による原子的クレーム。

import { getCurrentActorId, recordAudit } from "./audit";
import {
  canStartStep,
  downstreamStepIds,
  expectedInput,
  isWorkOrderComplete,
  type StepLinkState,
  type StepState,
  validateDagShape,
  validateQuantities,
  validateRouting,
  type WorkflowCtx,
} from "./workflow-core";

export interface StepQuantities {
  inputQuantity: number;
  outputSuccessQuantity: number;
  outputDefectSemiFinished: number;
  outputDefectScrap: number;
  outputDefectRework: number;
}

/** 不良の内訳（{種別, 理由, 数} — defect_reasons JSON + 区分列の権威）。 */
export interface StepDefectReason {
  type: "SEMI" | "SCRAP" | "REWORK";
  reason: string;
  count: number;
}

/** 指示書の実行コンテキスト（engine 形式）をロードする。 */
export async function fetchWorkflowCtx(workOrderId: string): Promise<{
  ctx: WorkflowCtx;
  workOrder: {
    id: string;
    workOrderNumber: number;
    status: string;
    plannedQuantity: number;
  };
}> {
  const wo = await prisma.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    include: { steps: true, stepLinks: true },
  });
  const execDeps = await prisma.processStepExecDependency.findMany();
  const steps: StepState[] = wo.steps.map((s) => ({
    id: s.id,
    processStepId: s.processStepId,
    status: s.status,
    sortOrder: s.sortOrder,
    inputQuantity: s.inputQuantity,
    outputSuccess: s.outputSuccessQuantity,
    defectSemiFinished: s.outputDefectSemiFinished,
    defectScrap: s.outputDefectScrap,
    defectRework: s.outputDefectRework,
    sessionLockedBy: s.sessionLockedBy,
  }));
  const links: StepLinkState[] = wo.stepLinks.map((l) => ({
    sourceStepId: l.sourceStepId,
    targetStepId: l.targetStepId,
    routedQuantity: l.routedQuantity,
  }));
  return {
    ctx: {
      plannedQuantity: wo.plannedQuantity,
      steps,
      links,
      execDeps: execDeps.map((d) => ({
        stepId: d.stepId,
        dependsOnStepId: d.dependsOnStepId,
        relation: d.relation,
      })),
    },
    workOrder: {
      id: wo.id,
      workOrderNumber: wo.workOrderNumber,
      status: wo.status,
      plannedQuantity: wo.plannedQuantity,
    },
  };
}

export interface StepActionResult {
  ok: boolean;
  errors?: string[];
}

/** 工程開始: 依存検証 → セッションロック原子取得 → IN_PROGRESS。 */
export async function startStepExecution(
  stepId: string,
): Promise<StepActionResult> {
  const actor = await getCurrentActorId();
  const stepRow = await prisma.workOrderStep.findUniqueOrThrow({
    where: { id: stepId },
    include: { workOrder: true },
  });
  if (
    stepRow.workOrder.status !== "APPROVED" &&
    stepRow.workOrder.status !== "IN_PROGRESS"
  ) {
    return { ok: false, errors: ["指示書が承認済み/進行中ではありません"] };
  }
  const { ctx } = await fetchWorkflowCtx(stepRow.workOrderId);
  const check = canStartStep(stepId, ctx, actor);
  if (!check.ok) return { ok: false, errors: check.reasons };

  const input = expectedInput(stepId, ctx);

  // 原子的クレーム: PENDING かつ未ロックの行だけを更新（同時開始の競合防止）
  const claimed = await prisma.workOrderStep.updateMany({
    where: {
      id: stepId,
      status: "PENDING",
      OR: [{ sessionLockedBy: null }, { sessionLockedBy: actor }],
    },
    data: {
      status: "IN_PROGRESS",
      sessionLockedBy: actor,
      sessionLockedAt: new Date(),
      startedAt: new Date(),
      startedBy: actor,
      inputQuantity: input ?? undefined,
    },
  });
  if (claimed.count === 0) {
    return { ok: false, errors: ["別のユーザーが先に開始しました"] };
  }

  // 最初の工程開始で指示書を進行中に
  if (stepRow.workOrder.status === "APPROVED") {
    await prisma.workOrder.update({
      where: { id: stepRow.workOrderId },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });
  }
  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(stepRow.workOrder.workOrderNumber),
    after: { note: `工程を開始（step ${stepRow.sortOrder}）` },
  });
  return { ok: true };
}

/**
 * 工程完了: 数量整合 + ルーティング整合 → 永続化 → 全完了なら WO 完了。
 *
 * 数量管理モード（カタログ quantity_tracking）:
 * - NONE: quantities は不要（null 可・無視）。受入数 = 既存 ?? 想定受入 ??
 *   予定数量、良品数 = 受入数、不良 0 でパススルー保存する。この規則により
 *   NONE 工程完了後も outputSuccess が常に埋まるため、expectedInput の
 *   前工程チェーン・validateRouting・computeWipByStep・onWorkOrderCompleted の
 *   終端工程集計（終端が NONE でも）が一切変更なしで成立する — 変えないこと。
 * - FLOW / INSPECTION: quantities 必須。保存則は同一の数式で、INSPECTION は
 *   ラベルのみ 検査数/合格/不合格 に変わる。
 */
export async function completeStepExecution(
  stepId: string,
  quantities: StepQuantities | null,
  defectReasons: StepDefectReason[] | null = null,
): Promise<StepActionResult> {
  const actor = await getCurrentActorId();
  const stepRow = await prisma.workOrderStep.findUniqueOrThrow({
    where: { id: stepId },
    include: {
      workOrder: true,
      outgoingLinks: true,
      processStep: { select: { quantityTracking: true } },
    },
  });
  if (stepRow.status !== "IN_PROGRESS") {
    return { ok: false, errors: ["進行中の工程ではありません"] };
  }
  if (stepRow.sessionLockedBy && stepRow.sessionLockedBy !== actor) {
    return { ok: false, errors: ["別のユーザーがセッション中です"] };
  }

  const mode = stepRow.processStep.quantityTracking;
  let persisted: StepQuantities;
  if (mode === "NONE") {
    const { ctx } = await fetchWorkflowCtx(stepRow.workOrderId);
    const input =
      stepRow.inputQuantity ??
      expectedInput(stepId, ctx) ??
      ctx.plannedQuantity;
    persisted = {
      inputQuantity: input,
      outputSuccessQuantity: input,
      outputDefectSemiFinished: 0,
      outputDefectScrap: 0,
      outputDefectRework: 0,
    };
  } else {
    if (quantities == null && (defectReasons?.length ?? 0) === 0) {
      return { ok: false, errors: ["数量を入力してください"] };
    }
    // 受入数は開始時に確定した値を権威とする（完了時のクライアント値は無視）。
    const authoritativeInput =
      stepRow.inputQuantity ?? quantities?.inputQuantity ?? 0;
    // 区分合計（半製品/廃棄/手直し）は**不良リストから導出**して権威とする。
    // リストが無い場合のみ quantities の区分へフォールバック（後方互換）。
    const list = defectReasons ?? [];
    const sumType = (t: StepDefectReason["type"]) =>
      list.reduce((s, r) => (r.type === t ? s + r.count : s), 0);
    const semi =
      list.length > 0
        ? sumType("SEMI")
        : (quantities?.outputDefectSemiFinished ?? 0);
    const scrap =
      list.length > 0 ? sumType("SCRAP") : (quantities?.outputDefectScrap ?? 0);
    const rework =
      list.length > 0
        ? sumType("REWORK")
        : (quantities?.outputDefectRework ?? 0);
    persisted = {
      inputQuantity: authoritativeInput,
      outputSuccessQuantity: authoritativeInput - semi - scrap - rework,
      outputDefectSemiFinished: semi,
      outputDefectScrap: scrap,
      outputDefectRework: rework,
    };
    const qIssues = validateQuantities(
      {
        inputQuantity: persisted.inputQuantity,
        outputSuccess: persisted.outputSuccessQuantity,
        defectSemiFinished: persisted.outputDefectSemiFinished,
        defectScrap: persisted.outputDefectScrap,
        defectRework: persisted.outputDefectRework,
      },
      mode,
    );
    if (qIssues.length > 0)
      return { ok: false, errors: qIssues.map((i) => i.message) };
  }

  // 不良の内訳（{種別, 理由, 数}）— 有効行のみ。空なら列を触らない。
  const cleanedReasons = (defectReasons ?? [])
    .filter((r) => Number.isFinite(r.count) && r.count > 0)
    .map((r) => ({ type: r.type, reason: r.reason.trim(), count: r.count }));

  const rIssues = validateRouting(
    {
      outputSuccess: persisted.outputSuccessQuantity,
      defectRework: persisted.outputDefectRework,
    },
    stepRow.outgoingLinks.map((l) => ({
      sourceStepId: l.sourceStepId,
      targetStepId: l.targetStepId,
      routedQuantity: l.routedQuantity,
    })),
  );
  if (rIssues.length > 0)
    return { ok: false, errors: rIssues.map((i) => i.message) };

  // 完了クレームは条件付き更新 — 同時完了はどちらか一方だけ成立し、
  // 在庫の二重計上を防ぐ（監査 P0-7/#5）。
  const claimed = await prisma.workOrderStep.updateMany({
    where: { id: stepId, status: "IN_PROGRESS" },
    data: {
      status: "COMPLETED",
      inputQuantity: persisted.inputQuantity,
      outputSuccessQuantity: persisted.outputSuccessQuantity,
      outputDefectSemiFinished: persisted.outputDefectSemiFinished,
      outputDefectScrap: persisted.outputDefectScrap,
      outputDefectRework: persisted.outputDefectRework,
      ...(cleanedReasons.length > 0 ? { defectReasons: cleanedReasons } : {}),
      completedAt: new Date(),
      completedBy: actor,
      sessionLockedBy: null,
      sessionLockedAt: null,
    },
  });
  if (claimed.count !== 1) {
    return { ok: false, errors: ["この工程は既に完了しています"] };
  }

  // 全工程完了 → 指示書完了 + 在庫計上（完成品ロット入庫・半製品入庫・予約確定）。
  // WO の COMPLETED 遷移も条件付き — 勝者 1 リクエストだけが在庫計上する。
  const { ctx } = await fetchWorkflowCtx(stepRow.workOrderId);
  if (isWorkOrderComplete(ctx)) {
    const flipped = await prisma.workOrder.updateMany({
      where: { id: stepRow.workOrderId, status: { not: "COMPLETED" } },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    if (flipped.count === 1) {
      const { onWorkOrderCompleted } = await import("./inventory");
      await onWorkOrderCompleted(stepRow.workOrderId);
    }
  }
  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(stepRow.workOrder.workOrderNumber),
    after: {
      note: `工程を完了（良品 ${persisted.outputSuccessQuantity}/${persisted.inputQuantity}）`,
      ...persisted,
    },
  });
  return { ok: true };
}

/** 進行中の中断（IN_PROGRESS → PENDING、ロック解放。数量は保持しない）。 */
export async function abortStepExecution(
  stepId: string,
  reason: string,
): Promise<StepActionResult> {
  const stepRow = await prisma.workOrderStep.findUniqueOrThrow({
    where: { id: stepId },
    include: { workOrder: true },
  });
  if (stepRow.status !== "IN_PROGRESS")
    return { ok: false, errors: ["進行中の工程ではありません"] };
  await prisma.workOrderStep.update({
    where: { id: stepId },
    data: {
      status: "PENDING",
      sessionLockedBy: null,
      sessionLockedAt: null,
      startedAt: null,
      startedBy: null,
      notes: reason || undefined,
    },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(stepRow.workOrder.workOrderNumber),
    after: { note: `工程を中断（巻き戻し）: ${reason}` },
  });
  return { ok: true };
}

/** 完了済みの巻き戻し（COMPLETED → PENDING、数量クリア。§7 F4→F1）。 */
export async function rollbackStepExecution(
  stepId: string,
  reason: string,
): Promise<StepActionResult> {
  const stepRow = await prisma.workOrderStep.findUniqueOrThrow({
    where: { id: stepId },
    include: { workOrder: true },
  });
  if (stepRow.status !== "COMPLETED")
    return { ok: false, errors: ["完了済みの工程ではありません"] };
  if (!reason.trim())
    return { ok: false, errors: ["巻き戻し理由を入力してください"] };
  // 指示書が完了済み = 在庫計上済み。巻き戻すと再完了で二重計上になるため
  // 禁止（棚卸調整で補正する — 監査 P0-7/#5）。
  if (stepRow.workOrder.status === "COMPLETED") {
    return {
      ok: false,
      errors: [
        "指示書が完了済み（在庫計上済み）のため巻き戻せません。数量の補正は在庫の棚卸調整で行ってください",
      ],
    };
  }

  // 後続が着手済みなら巻き戻し不可（数量整合を守る）。下流は DAG 到達性で
  // 判定する — 合流先は分岐工程より小さい sortOrder を持ち得る。
  const { ctx } = await fetchWorkflowCtx(stepRow.workOrderId);
  const downstreamIds = new Set(downstreamStepIds(stepId, ctx));
  const downstream = ctx.steps.filter((s) => downstreamIds.has(s.id));
  if (
    downstream.some((s) => s.status !== "PENDING" && s.status !== "CANCELLED")
  ) {
    return {
      ok: false,
      errors: [
        "後続工程が着手済みのため巻き戻せません（先に後続を巻き戻してください）",
      ],
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.workOrderStep.update({
      where: { id: stepId },
      data: {
        status: "PENDING",
        outputSuccessQuantity: null,
        outputDefectSemiFinished: null,
        outputDefectScrap: null,
        outputDefectRework: null,
        completedAt: null,
        completedBy: null,
        cancelReason: reason,
      },
    });
    // 指示書が完了扱いになっていたら進行中へ戻す
    await tx.workOrder.updateMany({
      where: { id: stepRow.workOrderId, status: "COMPLETED" },
      data: { status: "IN_PROGRESS", completedAt: null },
    });
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(stepRow.workOrder.workOrderNumber),
    after: { note: `工程を巻き戻し: ${reason}` },
  });
  return { ok: true };
}

/**
 * 分岐追加（§7 手直し・半製品再投入）: source 完了後に流す追加工程系列を作り、
 * source→先頭 のエッジ（routedQuantity）+ 系列内チェーン + 任意の合流エッジを張る。
 * ワークフロー変更承認（WORKFLOW_CHANGE）は §6 本実装まで監査記録のみ。
 */
export async function addBranchSeries(input: {
  workOrderId: string;
  sourceStepId: string;
  catalogStepIds: number[];
  routedQuantity: number;
  mergeTargetStepId?: string | null;
}): Promise<StepActionResult> {
  const { workOrderId, sourceStepId, catalogStepIds, routedQuantity } = input;
  if (catalogStepIds.length === 0)
    return { ok: false, errors: ["追加する工程を選択してください"] };
  if (routedQuantity <= 0)
    return { ok: false, errors: ["分岐数量は 1 以上で入力してください"] };

  const wo = await prisma.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    include: { steps: true, stepLinks: true },
  });
  const source = wo.steps.find((s) => s.id === sourceStepId);
  if (!source) return { ok: false, errors: ["分岐元の工程が見つかりません"] };
  if (input.mergeTargetStepId) {
    const merge = wo.steps.find((s) => s.id === input.mergeTargetStepId);
    if (!merge) return { ok: false, errors: ["合流先の工程が見つかりません"] };
    if (merge.status !== "PENDING")
      return { ok: false, errors: ["合流先が未着手ではありません"] };
  }

  const maxSort = Math.max(...wo.steps.map((s) => s.sortOrder));

  const result = await prisma.$transaction(async (tx) => {
    const created: string[] = [];
    for (let i = 0; i < catalogStepIds.length; i++) {
      const row = await tx.workOrderStep.create({
        data: {
          workOrderId,
          processStepId: catalogStepIds[i],
          sortOrder: maxSort + 10 * (i + 1),
          executionLocation: "INTERNAL",
          inputQuantity: i === 0 ? routedQuantity : null,
        },
        select: { id: true },
      });
      created.push(row.id);
    }
    const linkRows = [
      { sourceStepId, targetStepId: created[0], routedQuantity },
      ...created.slice(0, -1).map((id, i) => ({
        sourceStepId: id,
        targetStepId: created[i + 1],
        routedQuantity,
      })),
      ...(input.mergeTargetStepId
        ? [
            {
              sourceStepId: created[created.length - 1],
              targetStepId: input.mergeTargetStepId,
              routedQuantity,
            },
          ]
        : []),
    ];

    // DAG 形状検証（既存 + 追加分）
    const allSteps = [
      ...wo.steps.map((s) => ({ id: s.id })),
      ...created.map((id) => ({ id })),
    ];
    const allLinks: StepLinkState[] = [
      ...wo.stepLinks.map((l) => ({
        sourceStepId: l.sourceStepId,
        targetStepId: l.targetStepId,
        routedQuantity: l.routedQuantity,
      })),
      ...linkRows,
    ];
    const shapeErrors = validateDagShape(allSteps, allLinks);
    if (shapeErrors.length > 0) throw new Error(shapeErrors.join(" / "));

    await tx.workOrderStepLink.createMany({
      data: linkRows.map((l) => ({ workOrderId, ...l })),
    });
    return created;
  });

  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(wo.workOrderNumber),
    after: {
      note: `分岐を追加（${result.length} 工程, 数量 ${routedQuantity}${input.mergeTargetStepId ? ", 合流あり" : ""}）— ワークフロー変更承認は §6 本実装まで記録のみ`,
    },
  });
  return { ok: true };
}
