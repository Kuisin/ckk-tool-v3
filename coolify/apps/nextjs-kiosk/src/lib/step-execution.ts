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

import type { Prisma as PrismaNS } from "../../generated/client/client";
import { recordAudit } from "./audit";
import { prisma } from "./db";
import { jstDateOnly } from "./format";
import {
  canStartStep,
  computeFinishedQuantity,
  effectiveLotInputMode,
  expectedInput,
  isWorkOrderComplete,
  STEP_LINK_STATE_SELECT,
  STEP_STATE_SELECT,
  type StepLinkState,
  type StepState,
  toStepState,
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

/** 不良の内訳（{種別, 種類, 詳細, 数} — defect_reasons JSON + 区分列の権威）。 */
export interface StepDefectReason {
  type: "SEMI" | "SCRAP" | "REWORK";
  /** 不良種類（defect_types.id・必須）。旧データのみ null。 */
  defectTypeId?: number | null;
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
  | "DEFECT_REASONS_REQUIRED"
  | "LOT_REQUIRED"
  | "ROUTING_INVALID"
  | "TEMPLATE_INVALID"
  | "ITEMS_REQUIRED"
  | "DEFECT_TYPE_INVALID"
  | "LOCATION_NOT_FOUND"
  | "LOCATION_NOT_ALLOWED"
  | "DEVICE_LOCATION_BLOCKED"
  | "NO_OPEN_SESSION";

export interface StepActionResult {
  ok: boolean;
  /** 日本語の詳細（コード未対応時のフォールバック表示に使う）。 */
  errors?: string[];
  codes?: StepErrorCode[];
}

type Tx = PrismaNS.TransactionClient;

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
    // エンジンが読む列だけ（STEP_STATE_SELECT — workflow-core 参照）。
    // 全列 SELECT は列追加のたび migration 前の DB で P2022 に落ちる。
    include: {
      steps: { select: STEP_STATE_SELECT },
      stepLinks: { select: STEP_LINK_STATE_SELECT },
    },
  });
  const execDeps = await prisma.processStepExecDependency.findMany();
  const steps: StepState[] = wo.steps.map(toStepState);
  const links: StepLinkState[] = wo.stepLinks;
  const woLinkCtx = await fetchIncomingWoLinks(workOrderId);
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
      ...woLinkCtx,
    },
    workOrder: {
      id: wo.id,
      workOrderNumber: wo.workOrderNumber,
      status: wo.status,
    },
  };
}

/**
 * 先行指示書リンク（work_order_links の target = この指示書）の ctx 部分。
 * nextjs-web lib/workflow.ts fetchIncomingWoLinks と同一不変条件 —
 * 受け渡し数量は 全 source 完了時のみ解決（quantity 指定はその値、
 * 未指定 = source の完成数 computeFinishedQuantity）。
 */
async function fetchIncomingWoLinks(workOrderId: string): Promise<{
  incomingWoLinks?: { sourceWorkOrderNumber: number; sourceStatus: string }[];
  incomingWoQuantity?: number | null;
}> {
  const rows = await prisma.workOrderLink.findMany({
    where: { targetWorkOrderId: workOrderId },
    select: {
      quantity: true,
      sourceWorkOrder: {
        select: { id: true, workOrderNumber: true, status: true },
      },
    },
  });
  if (rows.length === 0) return {};
  const incomingWoLinks = rows.map((r) => ({
    sourceWorkOrderNumber: r.sourceWorkOrder.workOrderNumber,
    sourceStatus: r.sourceWorkOrder.status,
  }));
  const allDone = rows.every(
    (r) =>
      r.sourceWorkOrder.status === "COMPLETED" ||
      r.sourceWorkOrder.status === "CANCELLED",
  );
  if (!allDone) return { incomingWoLinks, incomingWoQuantity: null };
  let sum = 0;
  for (const r of rows) {
    if (r.sourceWorkOrder.status === "CANCELLED") continue;
    if (r.quantity != null) {
      sum += r.quantity;
      continue;
    }
    const src = await prisma.workOrder.findUniqueOrThrow({
      where: { id: r.sourceWorkOrder.id },
      include: {
        steps: { select: STEP_STATE_SELECT },
        stepLinks: { select: STEP_LINK_STATE_SELECT },
      },
    });
    sum += computeFinishedQuantity(src.steps.map(toStepState), src.stepLinks);
  }
  return { incomingWoLinks, incomingWoQuantity: sum };
}

/**
 * 行レベルの割り当てゲート（SCOPE.OWN 相当）。permission とは独立した二段目の門。
 * 操作できるのは次のいずれか:
 *   (a) 自分に計画（work_order_step_plans）が割り当てられている
 *   (b) 自分がセッションロックを保持している
 *   (c) 工程に計画が 1 行も無い（**未計画の工程は開放** — 指示書スキャン
 *       /wo-scan の運用判断: 紙の指示書を持つ作業者が計画なしのアドホック
 *       作業を進められる。誰かに計画された工程はその担当者だけが操作できる）
 */
export async function canOperateStep(
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
  if (plan != null || locked != null) return true;
  // (c) 未計画の工程 — 誰の計画も無ければ permission 保持者に開放
  const anyPlan = await prisma.workOrderStepPlan.findFirst({
    where: { stepId },
    select: { id: true },
  });
  return anyPlan == null;
}

/**
 * 同一作業者の open セグメント（endedAt null）の同時数を現状に合わせて
 * 張り直す — **同時実行の実績按分の唯一の実装**。
 *
 * 「1 実績行 = 一定の同時数（concurrent_count）を持つ作業セグメント」を
 * 不変条件とし、同時数が変わる瞬間（開始/再開/一時停止/完了）に、数の
 * 合わない open 行を endedAt で閉じて同条件 + 新しい同時数で開き直す。
 * 実働時間は duration / concurrent_count の合算（steps-core
 * accumulatedWorkMs / nextjs-web step-work-hours.ts）。
 * 必ず対象行の増減を済ませた後、同じ tx 内で呼ぶこと。
 */
async function resegmentOpenActuals(
  tx: Tx,
  userId: string,
  now: Date,
): Promise<void> {
  const open = await tx.workOrderStepActual.findMany({
    where: { userId, endedAt: null },
    select: {
      id: true,
      stepId: true,
      workLocationId: true,
      concurrentCount: true,
    },
  });
  const n = open.length;
  if (n === 0) return;
  for (const row of open) {
    if (row.concurrentCount === n) continue;
    await tx.workOrderStepActual.update({
      where: { id: row.id },
      data: { endedAt: now },
    });
    await tx.workOrderStepActual.create({
      data: {
        stepId: row.stepId,
        userId,
        workedDate: jstDateOnly(now),
        startedAt: now,
        workLocationId: row.workLocationId,
        concurrentCount: n,
        createdBy: userId,
      },
    });
  }
}

/**
 * 工程開始: 依存検証 → ロット入力検証 → セッションロック原子取得 → IN_PROGRESS。
 * 受入数は作業者の入力（`inputQuantity`）を優先し、未指定なら想定受入数。
 * 作業セッション行（work_order_step_actuals）を 1 行 open する。
 */
export async function startStepExecution(
  stepId: string,
  actorId: string,
  inputQuantity?: number | null,
  workLocationId?: number | null,
  lotText?: string | null,
): Promise<StepActionResult> {
  const stepRow = await prisma.workOrderStep.findUnique({
    where: { id: stepId },
    include: {
      workOrder: true,
      processStep: { select: { lotInputMode: true } },
    },
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

  // ロット/伝票コード — 実効モードは 上書き → カタログ既定（唯一の定義は
  // workflow-core.effectiveLotInputMode）。REQUIRED は未入力で開始不可。
  const lotMode = effectiveLotInputMode(
    stepRow.lotInputMode,
    stepRow.processStep.lotInputMode,
  );
  const lot = lotText?.trim() || null;
  if (lotMode === "REQUIRED" && lot == null) {
    return fail("LOT_REQUIRED", "ロット/伝票コードを入力してください");
  }

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
        ...(lotMode !== "NONE" && lot != null ? { lotText: lot } : {}),
      },
    });
    if (c.count === 0) return 0;
    // 同時作業数 = 既存 open セグメント + この工程。新規行は最初から
    // 正しい同時数で開き、既存行は resegment で張り直す（按分の不変条件）。
    const openBefore = await tx.workOrderStepActual.count({
      where: { userId: actorId, endedAt: null },
    });
    await tx.workOrderStepActual.create({
      data: {
        stepId,
        userId: actorId,
        workedDate: jstDateOnly(now),
        startedAt: now,
        workLocationId: workLocationId ?? null,
        concurrentCount: openBefore + 1,
        createdBy: actorId,
      },
    });
    if (openBefore > 0) await resegmentOpenActuals(tx, actorId, now);
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
      note: `工程を開始（step ${stepRow.sortOrder}・受入 ${input ?? "—"}）`,
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
    // 残りの open セグメントの同時数を張り直す（3 → 2 など）
    await resegmentOpenActuals(tx, actorId, now);
    return c.count;
  });
  if (released === 0) {
    return fail("LOCK_HELD_BY_OTHER", "別のユーザーがセッション中です");
  }

  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(stepRow.workOrder.workOrderNumber),
    after: { note: `工程を一時停止（step ${stepRow.sortOrder}）` },
  });
  return { ok: true };
}

/**
 * 再開: 空きロックを原子的に取り直し、新しい作業セッションを open する。
 * 作業場所は直前の自分のセッション行から引き継ぎ、無ければ端末の既定
 * （workLocationId 引数）を使う。
 */
export async function resumeStepExecution(
  stepId: string,
  actorId: string,
  workLocationId?: number | null,
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

  // 同じ工程を続きから — 直前の自分のセッションと同じ場所とみなす。
  const lastActual = await prisma.workOrderStepActual.findFirst({
    where: { stepId, userId: actorId },
    orderBy: { startedAt: "desc" },
    select: { workLocationId: true },
  });

  const now = new Date();
  const claimed = await prisma.$transaction(async (tx) => {
    const c = await tx.workOrderStep.updateMany({
      where: { id: stepId, status: "IN_PROGRESS", sessionLockedBy: null },
      data: { sessionLockedBy: actorId, sessionLockedAt: now },
    });
    if (c.count === 0) return 0;
    const openBefore = await tx.workOrderStepActual.count({
      where: { userId: actorId, endedAt: null },
    });
    await tx.workOrderStepActual.create({
      data: {
        stepId,
        userId: actorId,
        workedDate: jstDateOnly(now),
        startedAt: now,
        workLocationId: lastActual?.workLocationId ?? workLocationId ?? null,
        concurrentCount: openBefore + 1,
        createdBy: actorId,
      },
    });
    if (openBefore > 0) await resegmentOpenActuals(tx, actorId, now);
    return c.count;
  });
  if (claimed === 0) {
    return fail("LOCK_HELD_BY_OTHER", "別のユーザーがセッション中です");
  }

  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(stepRow.workOrder.workOrderNumber),
    after: { note: `工程を再開（step ${stepRow.sortOrder}）` },
  });
  return { ok: true };
}

/**
 * 工程マスタの許可作業場所を id 集合へ解決する（nextjs-web
 * lib/work-locations.ts fetchAllowedWorkLocationIds と同義）。
 * リンク行が無い工程は **null = 無制限**。
 */
export async function allowedWorkLocationIdsForStep(
  processStepId: number,
): Promise<Set<number> | null> {
  const links = await prisma.processStepWorkLocation.findMany({
    where: { processStepId },
    select: { typeKey: true, workLocationId: true },
  });
  if (links.length === 0) return null;
  const ids = new Set<number>();
  const typeKeys = links
    .map((l) => l.typeKey)
    .filter((k): k is string => k != null);
  for (const l of links) {
    if (l.workLocationId != null) ids.add(l.workLocationId);
  }
  if (typeKeys.length > 0) {
    const byType = await prisma.workLocation.findMany({
      where: { group: { typeKey: { in: typeKeys } } },
      select: { id: true },
    });
    for (const l of byType) ids.add(l.id);
  }
  return ids;
}

/**
 * 作業場所コード（QR `CKK:LOC:<code>`）→ id 解決。
 * 有効な場所・有効なグループのみ。見つからなければ null。
 */
export async function resolveWorkLocationByCode(
  code: string,
): Promise<{ id: number } | null> {
  const location = await prisma.workLocation.findFirst({
    where: { code, isActive: true, group: { isActive: true } },
    select: { id: true },
  });
  return location;
}

/**
 * 作業中セッションの作業場所を付け替える（作業場所 QR の読み取り）。
 * 対象は自分の open セッション行（endedAt null）のみ — 過去の実績は変えない。
 * 一時停止中は open 行が無いので失敗する（再開してから読む）。
 */
export async function setStepWorkLocation(
  stepId: string,
  actorId: string,
  workLocationId: number,
): Promise<StepActionResult> {
  const stepRow = await prisma.workOrderStep.findUnique({
    where: { id: stepId },
    include: { workOrder: { select: { workOrderNumber: true } } },
  });
  if (!stepRow) return fail("NOT_FOUND", "工程が見つかりません");
  if (stepRow.status !== "IN_PROGRESS") {
    return fail("NOT_IN_PROGRESS", "進行中の工程ではありません");
  }
  const updated = await prisma.workOrderStepActual.updateMany({
    where: { stepId, userId: actorId, endedAt: null },
    data: { workLocationId },
  });
  if (updated.count === 0) {
    return fail(
      "NO_OPEN_SESSION",
      "作業セッションがありません（再開してから読み取ってください）",
    );
  }
  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(stepRow.workOrder.workOrderNumber),
    after: {
      note: `作業場所を変更（step ${stepRow.sortOrder} / 作業場所 ${workLocationId}）`,
    },
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
 *   受入 − 不良（区分合計）で導出する。区分合計は不良リスト（defectReasons —
 *   各行に 種類 FK + 詳細 必須）のみから導出し、defect_reasons JSON に保存する。
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
    // 区分合計（半製品/廃棄/工程分岐）は**不良リストのみから導出**して権威とする。
    // リスト無しで区分数量だけが来るのは旧クライアント — 黙って受けず再入力を求める。
    const list = defectReasons ?? [];
    const quantitiesDefects =
      (quantities?.outputDefectSemiFinished ?? 0) +
      (quantities?.outputDefectScrap ?? 0) +
      (quantities?.outputDefectRework ?? 0);
    if (list.length === 0 && quantitiesDefects > 0) {
      return fail(
        "DEFECT_REASONS_REQUIRED",
        "不良の内訳（種類・詳細）を入力してください",
      );
    }
    // 各行の 不良種類（FK）と詳細は必須。種類はマスタの実在 + 有効を再検証する。
    if (list.some((r) => r.defectTypeId == null || r.reason.trim() === "")) {
      return fail(
        "DEFECT_REASONS_REQUIRED",
        "不良の各行に種類と詳細を入力してください",
      );
    }
    if (list.length > 0) {
      const ids = [...new Set(list.map((r) => r.defectTypeId as number))];
      const known = await prisma.defectType.findMany({
        where: { id: { in: ids }, isActive: true },
        select: { id: true },
      });
      if (known.length !== ids.length) {
        return fail("DEFECT_TYPE_INVALID", "不良種類が不正です");
      }
    }
    const sumType = (t: StepDefectReason["type"]) =>
      list.reduce((s, r) => (r.type === t ? s + r.count : s), 0);
    const semi = sumType("SEMI");
    const scrap = sumType("SCRAP");
    const rework = sumType("REWORK");
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

  // 不良の内訳（{種別, 種類, 詳細, 数}）— 有効行のみ。空なら列を触らない。
  const cleanedReasons = (defectReasons ?? [])
    .filter((r) => Number.isFinite(r.count) && r.count > 0)
    .map((r) => ({
      type: r.type,
      defectTypeId: r.defectTypeId ?? null,
      reason: r.reason.trim(),
      count: r.count,
    }));

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
    // この工程の open な作業セッションを全て閉じる（誰のものでも残さない）。
    // 閉じた作業者の残りセグメントは同時数が減るので張り直す。
    const openRows = await tx.workOrderStepActual.findMany({
      where: { stepId, endedAt: null },
      select: { userId: true },
    });
    await tx.workOrderStepActual.updateMany({
      where: { stepId, endedAt: null },
      data: { endedAt: now },
    });
    for (const uid of new Set(openRows.map((r) => r.userId))) {
      await resegmentOpenActuals(tx, uid, now);
    }
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
      note: `工程を完了（良品 ${persisted.outputSuccessQuantity}/${persisted.inputQuantity}）`,
      ...persisted,
    },
  });
  return { ok: true };
}
