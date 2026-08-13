/**
 * step-execution.ts — 工程実行（開始・一時停止・再開・完了）。server-only.
 *
 * キオスクは nextjs-web の内部書き込み API を叩かず、自前でこの層を持つ
 * （セキュリティ判断: 端末側から「任意ユーザーとして書ける」HTTP 面を作らない）。
 * 純ロジックは逐語コピーの `workflow-core.ts`、在庫計上は逐語コピーの
 * `inventory.ts` に委譲する（両方 `twin-files.test.ts` がドリフトを検出する）。
 *
 * nextjs-web の `lib/workflow.ts` と**同じ不変条件**を守ること:
 * - セッションロックの獲得は updateMany の WHERE 句による原子的クレーム。
 * - 完了クレームも条件付き更新 — 同時完了はどちらか一方だけ成立させ、
 *   在庫の二重計上を防ぐ（監査 P0-7/#5）。
 * - NONE モードのパススルー（受入数 = 既存 ?? 想定受入 ?? 予定数量、
 *   良品数 = 受入数、不良 0）。これで expectedInput のチェーン・
 *   validateRouting・onWorkOrderCompleted の終端集計が変更なしで成立する。
 *
 * キオスク固有の追加は「作業セッション」の記録:
 * 開始/再開で `work_order_step_actuals` を 1 行 open し、一時停止/完了で閉じる。
 * これにより STEP_STATUS に PAUSED を足さずに一時停止を表現できる
 * （一時停止 = IN_PROGRESS かつ session_locked_by IS NULL）。
 */

import { recordAudit } from "./audit";
import { prisma } from "./db";
import { jstDateOnly } from "./format";
import {
  canStartStep,
  expectedInput,
  isWorkOrderComplete,
  type StepLinkState,
  type StepState,
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

/** UI が翻訳して表示するエラー識別子（日本語文言に依存しないため）。 */
export type StepErrorCode =
  | "NOT_FOUND"
  | "NOT_ASSIGNED"
  | "WO_NOT_APPROVED"
  | "NOT_STARTABLE"
  | "LOCK_TAKEN"
  | "LOCK_HELD_BY_OTHER"
  | "NOT_IN_PROGRESS"
  | "ALREADY_COMPLETED"
  | "QUANTITY_REQUIRED"
  | "QUANTITY_INVALID"
  | "ROUTING_INVALID"
  | "TEMPLATE_INVALID"
  | "ITEMS_REQUIRED"
  | "DEFECT_TYPE_INVALID";

export interface StepActionResult {
  ok: boolean;
  /** 日本語の詳細（コード未対応時のフォールバック表示に使う）。 */
  errors?: string[];
  codes?: StepErrorCode[];
}

const fail = (code: StepErrorCode, ...errors: string[]): StepActionResult => ({
  ok: false,
  codes: [code],
  errors: errors.length > 0 ? errors : undefined,
});

/** 指示書の実行コンテキスト（workflow-core 形式）をロードする。 */
export async function fetchWorkflowCtx(workOrderId: string): Promise<{
  ctx: WorkflowCtx;
  workOrder: { id: string; workOrderNumber: number; status: string };
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
    },
  };
}

/**
 * 行レベルの割り当てゲート（SCOPE.OWN 相当）。
 * 「自分に計画が割り当てられている」か「自分がロックを保持している」工程のみ
 * 操作できる。permission の有無とは独立した二段目の門。
 */
export async function isAssignedToUser(
  stepId: string,
  userId: string,
): Promise<boolean> {
  const [plan, locked] = await Promise.all([
    prisma.workOrderStepPlan.findFirst({
      where: { stepId, userId },
      select: { id: true },
    }),
    prisma.workOrderStep.findFirst({
      where: { id: stepId, sessionLockedBy: userId },
      select: { id: true },
    }),
  ]);
  return plan != null || locked != null;
}

/**
 * 工程開始: 依存検証 → セッションロック原子取得 → IN_PROGRESS。
 * 受入数は作業者の入力（`inputQuantity`）を優先し、未指定なら想定受入数。
 * 作業セッション行（work_order_step_actuals）を 1 行 open する。
 */
export async function startStepExecution(
  stepId: string,
  actorId: string,
  inputQuantity?: number | null,
): Promise<StepActionResult> {
  const stepRow = await prisma.workOrderStep.findUnique({
    where: { id: stepId },
    include: { workOrder: true },
  });
  if (!stepRow) return fail("NOT_FOUND", "工程が見つかりません");
  if (
    stepRow.workOrder.status !== "APPROVED" &&
    stepRow.workOrder.status !== "IN_PROGRESS"
  ) {
    return fail("WO_NOT_APPROVED", "指示書が承認済み/進行中ではありません");
  }

  const { ctx } = await fetchWorkflowCtx(stepRow.workOrderId);
  const check = canStartStep(stepId, ctx, actorId);
  if (!check.ok)
    return { ok: false, codes: ["NOT_STARTABLE"], errors: check.reasons };

  const input = inputQuantity ?? expectedInput(stepId, ctx);
  const now = new Date();

  // 原子的クレーム + 作業セッション open を 1 トランザクションで。
  // 分割すると「IN_PROGRESS かつ自分がロック保持かつ open 行なし」という
  // 表現不可能な状態が生まれうる。
  const claimed = await prisma.$transaction(async (tx) => {
    const c = await tx.workOrderStep.updateMany({
      where: {
        id: stepId,
        status: "PENDING",
        OR: [{ sessionLockedBy: null }, { sessionLockedBy: actorId }],
      },
      data: {
        status: "IN_PROGRESS",
        sessionLockedBy: actorId,
        sessionLockedAt: now,
        startedAt: now,
        startedBy: actorId,
        inputQuantity: input ?? undefined,
      },
    });
    if (c.count === 0) return 0;
    await tx.workOrderStepActual.create({
      data: {
        stepId,
        userId: actorId,
        workedDate: jstDateOnly(now),
        startedAt: now,
        createdBy: actorId,
      },
    });
    return c.count;
  });
  if (claimed === 0) {
    return fail("LOCK_TAKEN", "別のユーザーが先に開始しました");
  }

  // 最初の工程開始で指示書を進行中に
  if (stepRow.workOrder.status === "APPROVED") {
    await prisma.workOrder.updateMany({
      where: { id: stepRow.workOrderId, status: "APPROVED" },
      data: { status: "IN_PROGRESS", startedAt: now },
    });
  }
  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(stepRow.workOrder.workOrderNumber),
    after: {
      note: `工程を開始（step ${stepRow.sortOrder}・受入 ${input ?? "—"}）（キオスク）`,
    },
  });
  return { ok: true };
}

/**
 * 一時停止: 作業セッションを閉じてロックを解放する。
 * STEP_STATUS は IN_PROGRESS のまま — 受入数・startedAt は保持する
 * （nextjs-web の「中断」= PENDING へ戻す破壊的操作とは別物）。
 */
export async function pauseStepExecution(
  stepId: string,
  actorId: string,
): Promise<StepActionResult> {
  const stepRow = await prisma.workOrderStep.findUnique({
    where: { id: stepId },
    include: { workOrder: { select: { workOrderNumber: true } } },
  });
  if (!stepRow) return fail("NOT_FOUND", "工程が見つかりません");
  if (stepRow.status !== "IN_PROGRESS") {
    return fail("NOT_IN_PROGRESS", "進行中の工程ではありません");
  }

  const now = new Date();
  const released = await prisma.$transaction(async (tx) => {
    const c = await tx.workOrderStep.updateMany({
      where: { id: stepId, status: "IN_PROGRESS", sessionLockedBy: actorId },
      data: { sessionLockedBy: null, sessionLockedAt: null },
    });
    if (c.count === 0) return 0;
    await tx.workOrderStepActual.updateMany({
      where: { stepId, userId: actorId, endedAt: null },
      data: { endedAt: now },
    });
    return c.count;
  });
  if (released === 0) {
    return fail("LOCK_HELD_BY_OTHER", "別のユーザーがセッション中です");
  }

  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(stepRow.workOrder.workOrderNumber),
    after: { note: `工程を一時停止（step ${stepRow.sortOrder}）（キオスク）` },
  });
  return { ok: true };
}

/** 再開: 空きロックを原子的に取り直し、新しい作業セッションを open する。 */
export async function resumeStepExecution(
  stepId: string,
  actorId: string,
): Promise<StepActionResult> {
  const stepRow = await prisma.workOrderStep.findUnique({
    where: { id: stepId },
    include: { workOrder: { select: { workOrderNumber: true, status: true } } },
  });
  if (!stepRow) return fail("NOT_FOUND", "工程が見つかりません");
  if (stepRow.status !== "IN_PROGRESS") {
    return fail("NOT_IN_PROGRESS", "進行中の工程ではありません");
  }
  if (
    stepRow.workOrder.status !== "APPROVED" &&
    stepRow.workOrder.status !== "IN_PROGRESS"
  ) {
    return fail("WO_NOT_APPROVED", "指示書が承認済み/進行中ではありません");
  }

  const now = new Date();
  const claimed = await prisma.$transaction(async (tx) => {
    const c = await tx.workOrderStep.updateMany({
      where: { id: stepId, status: "IN_PROGRESS", sessionLockedBy: null },
      data: { sessionLockedBy: actorId, sessionLockedAt: now },
    });
    if (c.count === 0) return 0;
    await tx.workOrderStepActual.create({
      data: {
        stepId,
        userId: actorId,
        workedDate: jstDateOnly(now),
        startedAt: now,
        createdBy: actorId,
      },
    });
    return c.count;
  });
  if (claimed === 0) {
    return fail("LOCK_HELD_BY_OTHER", "別のユーザーがセッション中です");
  }

  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(stepRow.workOrder.workOrderNumber),
    after: { note: `工程を再開（step ${stepRow.sortOrder}）（キオスク）` },
  });
  return { ok: true };
}

/**
 * 工程完了: 数量整合 + ルーティング整合 → 永続化 → 全完了なら WO 完了 + 在庫計上。
 *
 * 数量管理モード（カタログ quantity_tracking）— nextjs-web と同一契約:
 * - NONE: quantities 不要（null 可・無視）。パススルー保存する。**変えないこと**
 *   （expectedInput チェーン・validateRouting・onWorkOrderCompleted の終端集計が
 *   これに依存している）。
 * - FLOW / INSPECTION: quantities 必須。保存則は同一、ラベルのみ異なる。
 *   受入数は**開始時に確定した stepRow.inputQuantity を権威**とし、完了時の
 *   クライアント値では上書きしない（受入は開始後編集不可）。良品数は
 *   受入 − 不良（区分合計）で導出する。不良理由（defectReasons）は補助記録
 *   として defect_reasons JSON に保存する（在庫連携には使わない）。
 */
export async function completeStepExecution(
  stepId: string,
  actorId: string,
  quantities: StepQuantities | null,
  defectReasons: StepDefectReason[] | null = null,
): Promise<StepActionResult> {
  const stepRow = await prisma.workOrderStep.findUnique({
    where: { id: stepId },
    include: {
      workOrder: true,
      outgoingLinks: true,
      processStep: { select: { quantityTracking: true } },
    },
  });
  if (!stepRow) return fail("NOT_FOUND", "工程が見つかりません");
  if (stepRow.status !== "IN_PROGRESS") {
    return fail("NOT_IN_PROGRESS", "進行中の工程ではありません");
  }
  if (stepRow.sessionLockedBy && stepRow.sessionLockedBy !== actorId) {
    return fail("LOCK_HELD_BY_OTHER", "別のユーザーがセッション中です");
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
      return fail("QUANTITY_REQUIRED", "数量を入力してください");
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
    const totalDefects = semi + scrap + rework;
    persisted = {
      inputQuantity: authoritativeInput,
      outputSuccessQuantity: authoritativeInput - totalDefects,
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
    if (qIssues.length > 0) {
      return {
        ok: false,
        codes: ["QUANTITY_INVALID"],
        errors: qIssues.map((i) => i.message),
      };
    }
  }

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
  if (rIssues.length > 0) {
    return {
      ok: false,
      codes: ["ROUTING_INVALID"],
      errors: rIssues.map((i) => i.message),
    };
  }

  // 不良の内訳（{種別, 理由, 数}）— 有効行のみ。空なら列を触らない。
  const cleanedReasons = (defectReasons ?? [])
    .filter((r) => Number.isFinite(r.count) && r.count > 0)
    .map((r) => ({ type: r.type, reason: r.reason.trim(), count: r.count }));

  const now = new Date();
  // 完了クレームは条件付き更新 — 同時完了はどちらか一方だけ成立し、
  // 在庫の二重計上を防ぐ（監査 P0-7/#5）。作業セッションも同 tx で閉じる。
  const claimed = await prisma.$transaction(async (tx) => {
    const c = await tx.workOrderStep.updateMany({
      where: { id: stepId, status: "IN_PROGRESS" },
      data: {
        status: "COMPLETED",
        inputQuantity: persisted.inputQuantity,
        outputSuccessQuantity: persisted.outputSuccessQuantity,
        outputDefectSemiFinished: persisted.outputDefectSemiFinished,
        outputDefectScrap: persisted.outputDefectScrap,
        outputDefectRework: persisted.outputDefectRework,
        ...(cleanedReasons.length > 0 ? { defectReasons: cleanedReasons } : {}),
        completedAt: now,
        completedBy: actorId,
        sessionLockedBy: null,
        sessionLockedAt: null,
      },
    });
    if (c.count !== 1) return c.count;
    // この工程の open な作業セッションを全て閉じる（誰のものでも残さない）
    await tx.workOrderStepActual.updateMany({
      where: { stepId, endedAt: null },
      data: { endedAt: now },
    });
    return c.count;
  });
  if (claimed !== 1) {
    return fail("ALREADY_COMPLETED", "この工程は既に完了しています");
  }

  // 全工程完了 → 指示書完了 + 在庫計上（完成品ロット入庫・半製品入庫・予約確定）。
  // WO の COMPLETED 遷移も条件付き — 勝者 1 リクエストだけが在庫計上する。
  const { ctx } = await fetchWorkflowCtx(stepRow.workOrderId);
  if (isWorkOrderComplete(ctx)) {
    const flipped = await prisma.workOrder.updateMany({
      where: { id: stepRow.workOrderId, status: { not: "COMPLETED" } },
      data: { status: "COMPLETED", completedAt: now },
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
      note: `工程を完了（良品 ${persisted.outputSuccessQuantity}/${persisted.inputQuantity}）（キオスク）`,
      ...persisted,
    },
  });
  return { ok: true };
}
