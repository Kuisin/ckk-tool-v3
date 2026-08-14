/**
 * steps.ts — 「自分の工程」の読み取り。server-only.
 *
 * 割り当ての実体は `app.work_order_step_plans.user_id`（担当者・必須、
 * index (user_id, planned_date)）。キオスクのセッションユーザーは同じ
 * `app.users.id` 空間なので直接引ける。
 *
 * ただし計画行だけを見ると「昨日始めて終わっていない工程」が迷子になるので、
 * 次の 3 集合の和を「自分の工程」とする:
 *   (1) 期日到来済み（遅延含む）の計画がある工程
 *   (2) 自分がセッションロックを保持している工程
 *   (3) 自分の作業実績がある進行中の工程（＝自分が一時停止した工程）
 * (3) は一時停止で endedAt を埋めるため「open な実績」では拾えない点に注意。
 */

import { prisma } from "./db";
import {
  formatTime,
  jstDateOnly,
  jstDateString,
  type LocalizedText,
  localized,
} from "./format";
import type { Locale } from "./i18n";
import {
  accumulatedWorkMs,
  bucketOf,
  compareSteps,
  type StepBucket,
  type StepSessionState,
  stepSessionState,
} from "./steps-core";
import {
  canStartStep,
  expectedInput,
  type QuantityTrackingMode,
  type StepLinkState,
  type StepState,
  type WorkflowCtx,
} from "./workflow-core";

export interface MyStepView {
  stepId: string;
  workOrderNumber: number;
  productName: string;
  stepName: string;
  stepCode: string;
  plantName: string | null;
  quantityMode: QuantityTrackingMode;
  sessionState: StepSessionState;
  /** BLOCKED の理由（日本語・サーバー由来。UI は補助表示に使う）。 */
  blockReasons: string[];
  bucket: StepBucket;
  sortOrder: number;
  plannedDate: string | null;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  plannedQuantityForMe: number | null;
  /** 指示書の予定数量 */
  workOrderPlannedQuantity: number;
  /** 記録済みの受入数（開始済みのみ） */
  inputQuantity: number | null;
  /** 未開始工程の想定受入数 */
  expectedInputQuantity: number | null;
  outputSuccessQuantity: number | null;
  /** 予定作業時間 (h) — 任意。 */
  plannedWorkHours: number | null;
  /** 計画に割り当てられた作業場所名（任意）。 */
  workLocationName: string | null;
  /** 自分の累計作業時間 (ms) */
  workedMs: number;
  /** OTHER のときの作業者名 */
  lockedByName: string | null;
}

/** 一覧の 1 セクション。 */
export interface MyStepsResult {
  steps: MyStepView[];
  upcomingCount: number;
  /** 最近（既定 14 日）完了した自分の工程（既定は非表示・ボタンで開く）。 */
  completedSteps: MyStepView[];
  /** 自分が現在作業中（ロック保持）の工程 id。同時作業は 1 工程まで。 */
  activeStepId: string | null;
}

/** 作業中の別工程（実行画面のロック表示・誘導用）。 */
export interface MyActiveStep {
  stepId: string;
  stepName: string;
  workOrderNumber: number;
}

/**
 * 自分が現在作業中（ロック保持）の工程を返す（excludeStepId 以外）。
 * 開始/再開ボタンのロック表示に使う — サーバー側の権威は
 * step-execution.findMyActiveStep（開始・再開時に同条件で拒否）。
 */
export async function getMyActiveStep(
  userId: string,
  excludeStepId: string,
  locale: Locale,
): Promise<MyActiveStep | null> {
  const active = await prisma.workOrderStep.findFirst({
    where: {
      sessionLockedBy: userId,
      status: "IN_PROGRESS",
      id: { not: excludeStepId },
    },
    select: {
      id: true,
      processStep: { select: { name: true } },
      workOrder: { select: { workOrderNumber: true } },
    },
  });
  if (!active) return null;
  return {
    stepId: active.id,
    stepName: localized(asText(active.processStep.name), locale),
    workOrderNumber: active.workOrder.workOrderNumber,
  };
}

/** 完了工程を出す遡り期間（ミリ秒）。 */
const COMPLETED_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
/** 完了工程の最大表示件数。 */
const COMPLETED_LIMIT = 50;

/**
 * Prisma の Json 列（{ ja, en } 多言語フィールド）を表示用の型へ。
 * 中身の検証は localized() のフォールバックに任せる（欠損は '—'）。
 */
function asText(value: unknown): LocalizedText | null {
  return (value ?? null) as LocalizedText | null;
}

type PlanRow = {
  stepId: string;
  plannedDate: Date;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  quantity: number | null;
  /** 割り当てられた作業場所（機械/エリア — 任意）。 */
  workLocation?: { name: unknown } | null;
};

/** 指示書ごとの WorkflowCtx をまとめて組む（工程ごとに引かない）。 */
async function buildContexts(
  workOrderIds: string[],
): Promise<Map<string, WorkflowCtx>> {
  if (workOrderIds.length === 0) return new Map();
  const [workOrders, siblings, links, execDeps] = await Promise.all([
    prisma.workOrder.findMany({
      where: { id: { in: workOrderIds } },
      select: { id: true, plannedQuantity: true },
    }),
    prisma.workOrderStep.findMany({
      where: { workOrderId: { in: workOrderIds } },
      select: {
        id: true,
        workOrderId: true,
        processStepId: true,
        status: true,
        sortOrder: true,
        inputQuantity: true,
        outputSuccessQuantity: true,
        outputDefectSemiFinished: true,
        outputDefectScrap: true,
        outputDefectRework: true,
        sessionLockedBy: true,
      },
    }),
    prisma.workOrderStepLink.findMany({
      where: { workOrderId: { in: workOrderIds } },
      select: {
        workOrderId: true,
        sourceStepId: true,
        targetStepId: true,
        routedQuantity: true,
      },
    }),
    prisma.processStepExecDependency.findMany(),
  ]);

  const deps = execDeps.map((d) => ({
    stepId: d.stepId,
    dependsOnStepId: d.dependsOnStepId,
    relation: d.relation,
  }));

  const stepsByWo = new Map<string, StepState[]>();
  for (const s of siblings) {
    const list = stepsByWo.get(s.workOrderId) ?? [];
    list.push({
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
    });
    stepsByWo.set(s.workOrderId, list);
  }
  const linksByWo = new Map<string, StepLinkState[]>();
  for (const l of links) {
    const list = linksByWo.get(l.workOrderId) ?? [];
    list.push({
      sourceStepId: l.sourceStepId,
      targetStepId: l.targetStepId,
      routedQuantity: l.routedQuantity,
    });
    linksByWo.set(l.workOrderId, list);
  }

  const result = new Map<string, WorkflowCtx>();
  for (const wo of workOrders) {
    result.set(wo.id, {
      plannedQuantity: wo.plannedQuantity,
      steps: stepsByWo.get(wo.id) ?? [],
      links: linksByWo.get(wo.id) ?? [],
      execDeps: deps,
    });
  }
  return result;
}

/** 工程 id 集合 → 表示用ビュー（共通の hydrate 処理）。 */
async function hydrateSteps(
  stepIds: string[],
  userId: string,
  locale: Locale,
  plansByStep: Map<string, PlanRow>,
  todayJst: string,
): Promise<MyStepView[]> {
  if (stepIds.length === 0) return [];

  const rows = await prisma.workOrderStep.findMany({
    where: { id: { in: stepIds } },
    include: {
      processStep: {
        select: { code: true, name: true, quantityTracking: true },
      },
      plant: { select: { name: true } },
      workOrder: {
        select: {
          id: true,
          workOrderNumber: true,
          plannedQuantity: true,
          salesOrder: { select: { product: { select: { name: true } } } },
        },
      },
      actuals: {
        where: { userId },
        select: { startedAt: true, endedAt: true },
      },
    },
  });

  const contexts = await buildContexts([
    ...new Set(rows.map((r) => r.workOrderId)),
  ]);

  // OTHER 表示用に、他人が掴んでいる工程の作業者名だけ解決する
  const otherLockIds = [
    ...new Set(
      rows
        .map((r) => r.sessionLockedBy)
        .filter((id): id is string => id != null && id !== userId),
    ),
  ];
  const lockOwners = new Map<string, string>();
  if (otherLockIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: otherLockIds } },
      select: { id: true, displayName: true },
    });
    for (const u of users) lockOwners.set(u.id, u.displayName);
  }

  const now = new Date();
  const views: MyStepView[] = [];
  for (const r of rows) {
    const ctx = contexts.get(r.workOrderId);
    if (!ctx) continue;
    const state = stepSessionState(
      { id: r.id, status: r.status, sessionLockedBy: r.sessionLockedBy },
      ctx,
      userId,
    );
    const plan = plansByStep.get(r.id);
    const plannedDate = plan ? jstDateString(plan.plannedDate) : null;
    views.push({
      stepId: r.id,
      workOrderNumber: r.workOrder.workOrderNumber,
      productName: localized(
        asText(r.workOrder.salesOrder.product.name),
        locale,
      ),
      stepName: localized(asText(r.processStep.name), locale),
      stepCode: r.processStep.code,
      plantName: r.plant ? localized(asText(r.plant.name), locale) : null,
      quantityMode: r.processStep.quantityTracking,
      sessionState: state,
      blockReasons:
        state === "BLOCKED" ? canStartStep(r.id, ctx, userId).reasons : [],
      bucket: bucketOf(plannedDate, todayJst),
      sortOrder: r.sortOrder,
      plannedDate,
      plannedStartAt: plan ? formatTime(plan.plannedStartAt) : null,
      plannedEndAt: plan ? formatTime(plan.plannedEndAt) : null,
      plannedQuantityForMe: plan?.quantity ?? null,
      workOrderPlannedQuantity: r.workOrder.plannedQuantity,
      inputQuantity: r.inputQuantity,
      expectedInputQuantity: expectedInput(r.id, ctx),
      outputSuccessQuantity: r.outputSuccessQuantity,
      plannedWorkHours:
        r.plannedWorkHours == null ? null : Number(r.plannedWorkHours),
      workLocationName: plan?.workLocation
        ? localized(asText(plan.workLocation.name), locale)
        : null,
      workedMs: accumulatedWorkMs(r.actuals, now),
      lockedByName:
        state === "OTHER" && r.sessionLockedBy
          ? (lockOwners.get(r.sessionLockedBy) ?? null)
          : null,
    });
  }
  return views.sort(compareSteps);
}

/** 自分に割り当てられた（＝操作対象の）工程の一覧。 */
export async function listMySteps(
  userId: string,
  locale: Locale,
): Promise<MyStepsResult> {
  const now = new Date();
  const today = jstDateOnly(now);
  const todayJst = jstDateString(now);

  const [planned, held, worked, upcomingCount, completedRows] =
    await Promise.all([
      // (1) 期日到来済み（遅延含む）の計画
      prisma.workOrderStepPlan.findMany({
        where: {
          userId,
          plannedDate: { lte: today },
          step: {
            status: { in: ["PENDING", "IN_PROGRESS"] },
            workOrder: { status: { in: ["APPROVED", "IN_PROGRESS"] } },
          },
        },
        select: {
          stepId: true,
          plannedDate: true,
          plannedStartAt: true,
          plannedEndAt: true,
          quantity: true,
          workLocation: { select: { name: true } },
        },
        orderBy: [{ plannedDate: "asc" }, { plannedStartAt: "asc" }],
      }),
      // (2) 自分がロックを保持している工程
      prisma.workOrderStep.findMany({
        where: { sessionLockedBy: userId, status: "IN_PROGRESS" },
        select: { id: true },
      }),
      // (3) 自分が作業した進行中の工程（自分が一時停止したもの）
      prisma.workOrderStepActual.findMany({
        where: {
          userId,
          step: {
            status: "IN_PROGRESS",
            workOrder: { status: { in: ["APPROVED", "IN_PROGRESS"] } },
          },
        },
        select: { stepId: true },
        distinct: ["stepId"],
      }),
      // (4) 予定件数（チップ表示のみ）
      prisma.workOrderStepPlan.count({
        where: {
          userId,
          plannedDate: { gt: today },
          step: {
            status: "PENDING",
            workOrder: { status: { in: ["APPROVED", "IN_PROGRESS"] } },
          },
        },
      }),
      // (5) 最近完了した自分の工程（計画 or 実績で関与）— completedAt 降順
      prisma.workOrderStep.findMany({
        where: {
          status: "COMPLETED",
          completedAt: { gte: new Date(now.getTime() - COMPLETED_LOOKBACK_MS) },
          OR: [
            { plans: { some: { userId } } },
            { actuals: { some: { userId } } },
          ],
        },
        select: { id: true },
        orderBy: { completedAt: "desc" },
        take: COMPLETED_LIMIT,
      }),
    ]);

  // 同一工程に複数計画行がある（分割計画）場合は最も早い 1 行を代表にする
  const plansByStep = new Map<string, PlanRow>();
  for (const p of planned) {
    if (!plansByStep.has(p.stepId)) plansByStep.set(p.stepId, p);
  }

  const stepIds = [
    ...new Set([
      ...planned.map((p) => p.stepId),
      ...held.map((s) => s.id),
      ...worked.map((a) => a.stepId),
    ]),
  ];

  const steps = await hydrateSteps(
    stepIds,
    userId,
    locale,
    plansByStep,
    todayJst,
  );

  // 完了工程は completedAt 降順で出す（hydrateSteps は compareSteps 順に
  // 並べ替えるので、元の id 順へ戻す）。計画情報は付けない（別セクション）。
  const completedIds = completedRows.map((r) => r.id);
  const completedHydrated = await hydrateSteps(
    completedIds,
    userId,
    locale,
    new Map(),
    todayJst,
  );
  const completedById = new Map(completedHydrated.map((v) => [v.stepId, v]));
  const completedSteps = completedIds
    .map((id) => completedById.get(id))
    .filter((v): v is MyStepView => v != null);

  return {
    steps,
    upcomingCount,
    completedSteps,
    activeStepId: held[0]?.id ?? null,
  };
}

/**
 * 単一工程の詳細。割り当てゲートを兼ねる — 自分の工程でなければ null。
 * （URL 直叩きで他人の工程を開けないようにする）
 */
export async function getMyStep(
  userId: string,
  stepId: string,
  locale: Locale,
): Promise<MyStepView | null> {
  const now = new Date();
  const [plan, locked] = await Promise.all([
    prisma.workOrderStepPlan.findFirst({
      where: { stepId, userId },
      select: {
        stepId: true,
        plannedDate: true,
        plannedStartAt: true,
        plannedEndAt: true,
        quantity: true,
        workLocation: { select: { name: true } },
      },
      orderBy: [{ plannedDate: "asc" }, { plannedStartAt: "asc" }],
    }),
    prisma.workOrderStep.findFirst({
      where: { id: stepId, sessionLockedBy: userId },
      select: { id: true },
    }),
  ]);
  if (!plan && !locked) return null;

  const plansByStep = new Map<string, PlanRow>();
  if (plan) plansByStep.set(plan.stepId, plan);
  const views = await hydrateSteps(
    [stepId],
    userId,
    locale,
    plansByStep,
    jstDateString(now),
  );
  return views[0] ?? null;
}
