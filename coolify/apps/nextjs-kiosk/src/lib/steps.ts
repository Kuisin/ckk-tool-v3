/**
 * steps.ts — 「自分の工程」の読み取り。server-only.
 *
 * 割り当ての実体は `app.work_order_step_plans.user_id`（担当者。任意 —
 * 工程マスタで要求した工程だけ必須。index (user_id, planned_date)）。キオスクのセッションユーザーは同じ
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
  deviceName,
  formatTime,
  jstDateOnly,
  jstDateString,
  type LocalizedText,
  localized,
  workLocationLabel,
} from "./format";
import type { Locale } from "./i18n";
import { type PlanAssignee, stepOperability } from "./location-board-core";
import { allowedWorkLocationIdsForStep } from "./step-execution";
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
  effectiveLotInputMode,
  expectedInput,
  type LotInputMode,
  type QuantityTrackingMode,
  type StepLinkState,
  type StepState,
  type WorkflowCtx,
} from "./workflow-core";
import { workflowCoreT } from "./workflow-core-labels";

export interface MyStepView {
  stepId: string;
  workOrderNumber: number;
  productName: string;
  stepName: string;
  stepCode: string;
  plantName: string | null;
  quantityMode: QuantityTrackingMode;
  sessionState: StepSessionState;
  /** BLOCKED の理由（サーバー由来・利用者の言語で解決済み。UI は補助表示に使う）。 */
  blockReasons: string[];
  bucket: StepBucket;
  sortOrder: number;
  plannedDate: string | null;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  plannedQuantityForMe: number | null;
  /** 指示書の予定数量 */
  workOrderPlannedQuantity: number;
  /** 社内 / 外注（INTERNAL | OUTSOURCE）。 */
  executionLocation: string;
  /** 記録済みの受入数（開始済みのみ） */
  inputQuantity: number | null;
  /** 未開始工程の想定受入数 */
  expectedInputQuantity: number | null;
  outputSuccessQuantity: number | null;
  /** 不良内訳（完了工程の表示用）。 */
  defectSemiFinished: number | null;
  defectScrap: number | null;
  defectRework: number | null;
  /** 予定作業時間 (h) — 任意。 */
  plannedWorkHours: number | null;
  /** ロット/伝票コード入力の実効モード（上書き → カタログ既定）。 */
  lotInputMode: LotInputMode;
  /** 開始時に記録したロット/伝票コード。 */
  lotText: string | null;
  /** 計画に割り当てられた作業場所名（任意）。 */
  workLocationName: string | null;
  /**
   * 実績（自分の最新セッション行）に記録された作業場所名。
   * 端末の既定 or 作業場所 QR の読み取りで入る（未記録は null）。
   */
  actualWorkLocationName: string | null;
  /** 自分の累計作業時間 (ms) — 同時実行セグメントは按分済み。 */
  workedMs: number;
  /** 自分の open セグメントの同時作業数（作業中でなければ 1）。 */
  openConcurrentCount: number;
  /** OTHER のときの作業者名 */
  lockedByName: string | null;
}

/** 一覧の 1 セクション。 */
export interface MyStepsResult {
  steps: MyStepView[];
  upcomingCount: number;
  /** 最近（既定 14 日）完了した自分の工程（既定は非表示・ボタンで開く）。 */
  completedSteps: MyStepView[];
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
        select: {
          code: true,
          name: true,
          quantityTracking: true,
          lotInputMode: true,
        },
      },
      plant: { select: { name: true } },
      workOrder: {
        select: {
          id: true,
          workOrderNumber: true,
          plannedQuantity: true,
          product: { select: { name: true } },
        },
      },
      actuals: {
        where: { userId },
        select: {
          startedAt: true,
          endedAt: true,
          concurrentCount: true,
          workLocation: { select: { name: true } },
        },
        orderBy: { startedAt: "asc" },
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
      productName: localized(asText(r.workOrder.product.name), locale),
      stepName: localized(asText(r.processStep.name), locale),
      stepCode: r.processStep.code,
      plantName: r.plant ? localized(asText(r.plant.name), locale) : null,
      quantityMode: r.processStep.quantityTracking,
      executionLocation: r.executionLocation,
      sessionState: state,
      blockReasons:
        state === "BLOCKED"
          ? canStartStep(r.id, ctx, userId, workflowCoreT(locale)).reasons
          : [],
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
      defectSemiFinished: r.outputDefectSemiFinished,
      defectScrap: r.outputDefectScrap,
      defectRework: r.outputDefectRework,
      plannedWorkHours:
        r.plannedWorkHours == null ? null : Number(r.plannedWorkHours),
      lotInputMode: effectiveLotInputMode(
        r.lotInputMode,
        r.processStep.lotInputMode,
      ),
      lotText: r.lotText,
      workLocationName: plan?.workLocation
        ? localized(asText(plan.workLocation.name), locale)
        : null,
      actualWorkLocationName: (() => {
        const last = r.actuals.at(-1);
        return last?.workLocation
          ? localized(asText(last.workLocation.name), locale)
          : null;
      })(),
      workedMs: accumulatedWorkMs(r.actuals, now),
      openConcurrentCount: Math.max(
        1,
        r.actuals.find((a) => a.endedAt == null)?.concurrentCount ?? 1,
      ),
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
  };
}

/**
 * 単一工程の詳細。割り当てゲートを兼ねる — 操作できない工程は null。
 * （URL 直叩きで他人の工程を開けないようにする）
 *
 * 開けるのは step-execution.ts `canOperateStep` と同じ 3 条件:
 * 自分の計画がある / 自分がロック保持 / 計画が 1 行も無い（未計画は
 * 指示書スキャン /wo-scan の運用対象として開放）。
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
  if (!plan && !locked) {
    // 未計画の工程だけ開放（誰かの計画がある工程は担当者のみ。担当者なしの
    // 計画行は誰も縛らない — step-execution.ts canOperateStep と同じ規則）
    const anyPlan = await prisma.workOrderStepPlan.findFirst({
      where: { stepId, userId: { not: null } },
      select: { id: true },
    });
    if (anyPlan) return null;
  }

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

/** 指示書スキャン（/wo-scan）: 指示書ビューの 1 工程。 */
export interface WorkOrderStepItem {
  step: MyStepView;
  /** 計画で割り当てられている担当者名（重複除去・計画順）。空 = 未計画。 */
  assigneeNames: string[];
  /**
   * 行レベルゲート（step-execution.ts canOperateStep）を通るか —
   * 自分の計画がある / 計画が 1 行も無い（未計画は開放）。
   */
  canOperate: boolean;
}

/** 指示書スキャン（/wo-scan）: 指示書ヘッダ + 全工程。 */
export interface WorkOrderOverview {
  workOrderNumber: number;
  /** WORK_ORDER_STATUS（DRAFT..CANCELLED）。 */
  status: string;
  productName: string;
  /** 使用素材（未指定は null）。 */
  materialName: string | null;
  plannedQuantity: number;
  steps: WorkOrderStepItem[];
}

/**
 * 指示書番号 → 指示書ビュー（QR スキャン後の画面）。存在しなければ null。
 *
 * 一覧（listMySteps）と違い**全工程**を工程順で返す — 紙の指示書と
 * 突き合わせて全体の進み具合を見る画面のため。操作可否は工程ごとの
 * canOperate（+ sessionState）が持つ。
 */
export async function getWorkOrderOverview(
  workOrderNumber: number,
  userId: string,
  locale: Locale,
): Promise<WorkOrderOverview | null> {
  const wo = await prisma.workOrder.findUnique({
    where: { workOrderNumber },
    select: {
      id: true,
      workOrderNumber: true,
      status: true,
      plannedQuantity: true,
      product: { select: { name: true } },
      material: { select: { name: true } },
      steps: { select: { id: true } },
    },
  });
  if (!wo) return null;

  const stepIds = wo.steps.map((s) => s.id);
  const plans =
    stepIds.length > 0
      ? await prisma.workOrderStepPlan.findMany({
          where: { stepId: { in: stepIds } },
          select: {
            stepId: true,
            userId: true,
            plannedDate: true,
            plannedStartAt: true,
            plannedEndAt: true,
            quantity: true,
            workLocation: { select: { name: true } },
            user: { select: { displayName: true } },
          },
          orderBy: [{ plannedDate: "asc" }, { plannedStartAt: "asc" }],
        })
      : [];

  // 自分の計画（最も早い 1 行）だけを hydrate に渡す — 一覧と同じ表示規則
  const myPlansByStep = new Map<string, PlanRow>();
  const assigneesByStep = new Map<string, string[]>();
  const myPlannedSteps = new Set<string>();
  for (const p of plans) {
    if (p.userId === userId) {
      myPlannedSteps.add(p.stepId);
      if (!myPlansByStep.has(p.stepId)) myPlansByStep.set(p.stepId, p);
    }
    const names = assigneesByStep.get(p.stepId) ?? [];
    if (p.user && !names.includes(p.user.displayName))
      names.push(p.user.displayName);
    assigneesByStep.set(p.stepId, names);
  }

  const views = await hydrateSteps(
    stepIds,
    userId,
    locale,
    myPlansByStep,
    jstDateString(new Date()),
  );
  // hydrateSteps は担当一覧向けの並び（compareSteps）— 指示書ビューは
  // 紙と同じ工程順（sortOrder）に直す
  const items = views
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((v) => ({
      step: v,
      assigneeNames: assigneesByStep.get(v.stepId) ?? [],
      canOperate:
        myPlannedSteps.has(v.stepId) || !assigneesByStep.has(v.stepId),
    }));

  return {
    workOrderNumber: wo.workOrderNumber,
    status: wo.status,
    productName: localized(asText(wo.product.name), locale),
    materialName: wo.material
      ? localized(asText(wo.material.name), locale)
      : null,
    plannedQuantity: wo.plannedQuantity,
    steps: items,
  };
}

// ── 作業場所別の一覧（/work-location） ──────────────────────────────────────

/** 作業場所別の一覧の 1 行。 */
export interface LocationStepItem {
  step: MyStepView;
  /** 計画で割り当てられている担当者名（重複除去・計画順）。空 = 担当者なし。 */
  assigneeNames: string[];
  /** 行レベルゲート（step-execution.ts canOperateStep）を通るか。 */
  canOperate: boolean;
}

export interface LocationStepsResult {
  steps: LocationStepItem[];
  /** 予定（期日前）の件数 — チップ表示のみ。 */
  upcomingCount: number;
}

/**
 * 作業場所（1 か所 or グループ全体）で待っている工程の一覧。
 *
 * listMySteps の 3 集合の和を、担当者ではなく**場所**で引き直したもの:
 *   (A) 期日到来済み（遅延含む）の計画がこの場所にある工程 — 主役。
 *       作業計画は担当者が任意になり計画日 + 作業場所が必須になったので
 *       （20261015090000 / 20261017090000 / 20261018090000）、「いつ・どこで」
 *       だけ決めた行が普通に作られる。それは userId で引く listMySteps には
 *       **一切出てこない** — この画面が埋めるのはその穴。
 *   (B) この場所で記録された実績を持つ進行中の工程。
 *       **userId で絞らない**（この画面の主旨）し、**endedAt でも絞らない** —
 *       一時停止は実績行を閉じるので、絞ると「この機械で止まっている工程」が
 *       全部消える。
 *   (C) 予定件数（行は引かない）。
 *
 * 使わないもの:
 *   - 工程マスタの許可作業場所（allowedWorkLocationIdsForStep）。あれは
 *     リンク 0 件が「無制限」を意味するので、所属条件にすると**無制限の工程が
 *     全部の場所に出る**。「ここで動かしてよいか」であって「ここで待っているか」
 *     ではない（実行画面のゲート getStepLocationGate が正しい用途）。
 *   - work_order_steps.plant_id。同じ失敗のもっと粗い版（拠点全部の仕掛かりが
 *     1 台の機械に出る）。
 *
 * 完了工程は返さない。「自分が何を終えたか」は個人の問いなので /steps にあるが、
 * 「この機械が何を終えたか」は帳票の問いで、現場のタブレットの仕事ではない。
 */
export async function listStepsAtLocation(
  locationIds: number[],
  userId: string,
  locale: Locale,
): Promise<LocationStepsResult> {
  if (locationIds.length === 0) return { steps: [], upcomingCount: 0 };

  const now = new Date();
  const today = jstDateOnly(now);
  const todayJst = jstDateString(now);
  const [planned, worked, upcomingCount] = await Promise.all([
    // (A) この場所の、期日到来済みの計画
    prisma.workOrderStepPlan.findMany({
      where: {
        workLocationId: { in: locationIds },
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
    // (B) この場所で記録された実績を持つ進行中の工程
    prisma.workOrderStepActual.findMany({
      where: {
        workLocationId: { in: locationIds },
        step: {
          status: "IN_PROGRESS",
          workOrder: { status: { in: ["APPROVED", "IN_PROGRESS"] } },
        },
      },
      select: { stepId: true },
      distinct: ["stepId"],
    }),
    // (C) 予定件数（チップ表示のみ）
    prisma.workOrderStepPlan.count({
      where: {
        workLocationId: { in: locationIds },
        plannedDate: { gt: today },
        step: {
          status: "PENDING",
          workOrder: { status: { in: ["APPROVED", "IN_PROGRESS"] } },
        },
      },
    }),
  ]);

  // 同一工程に複数計画行がある（分割計画）場合は最も早い 1 行を代表にする。
  // 代表はこの場所の計画 — この行が一覧に出ている理由そのものなので、
  // 表示する計画日時・作業場所はそれで合っている。
  const plansByStep = new Map<string, PlanRow>();
  for (const p of planned) {
    if (!plansByStep.has(p.stepId)) plansByStep.set(p.stepId, p);
  }

  const stepIds = [
    ...new Set([
      ...planned.map((p) => p.stepId),
      ...worked.map((a) => a.stepId),
    ]),
  ];
  if (stepIds.length === 0) return { steps: [], upcomingCount };

  // 操作可否は「**担当者付きの**計画が他にあるか」で決まる（canOperateStep）。
  // この場所の計画だけを見ると、別の場所で誰かに割り当てられている工程を
  // 開放してしまうので、対象工程の**全計画**を引く。
  const allPlans = await prisma.workOrderStepPlan.findMany({
    where: { stepId: { in: stepIds } },
    select: {
      stepId: true,
      userId: true,
      user: { select: { displayName: true } },
    },
    orderBy: [{ plannedDate: "asc" }, { plannedStartAt: "asc" }],
  });
  const assigneesByStep = new Map<string, PlanAssignee[]>();
  for (const p of allPlans) {
    const list = assigneesByStep.get(p.stepId) ?? [];
    list.push({ userId: p.userId, displayName: p.user?.displayName ?? null });
    assigneesByStep.set(p.stepId, list);
  }

  const views = await hydrateSteps(
    stepIds,
    userId,
    locale,
    plansByStep,
    todayJst,
  );

  const steps = views.map((step) => {
    // sessionState === "WORKING" は「自分がロックを保持している」— canOperateStep の
    // 条件 (b)。自分が掴んでいる工程は、誰の計画であろうと続けられる。
    const { canOperate, assigneeNames } = stepOperability(
      assigneesByStep.get(step.stepId) ?? [],
      userId,
      step.sessionState === "WORKING",
    );
    return { step, assigneeNames, canOperate };
  });

  return { steps, upcomingCount };
}

// ── 作業場所ゲート（工程マスタの許可作業場所 × 端末） ────────────────────────

export interface StepLocationGate {
  /** 工程マスタに許可作業場所リンクがある（= 制限あり）。 */
  restricted: boolean;
  /** この端末の「作業場所の制限」トグルが ON。 */
  enforced: boolean;
  /** この端末の既定作業場所が許可に含まれる（制限なしなら常に true）。 */
  deviceAllowed: boolean;
  deviceDefaultLabel: string | null;
  /** 許可作業場所（ラベル + そこを既定にしている稼働端末名）。制限ありのみ。 */
  allowed: { label: string; deviceNames: string[] }[];
}

/**
 * 工程実行画面のサーバー側ゲート情報。実行可否の権威はあくまで
 * API 側（route.ts の DEVICE_LOCATION_BLOCKED）— これは表示用。
 * enforced && restricted && !deviceAllowed のとき UI は開始/再開を隠し、
 * 「どこ（どの端末）でなら実行できるか」を allowed で示す。
 */
export async function getStepLocationGate(
  stepId: string,
  deviceId: string,
  locale: Locale,
): Promise<StepLocationGate> {
  const [stepRow, deviceRow] = await Promise.all([
    prisma.workOrderStep.findUnique({
      where: { id: stepId },
      select: { processStepId: true },
    }),
    prisma.kioskDevice.findUnique({
      where: { id: deviceId },
      select: {
        enforceWorkLocation: true,
        defaultWorkLocationId: true,
        defaultWorkLocation: {
          select: { name: true, group: { select: { name: true } } },
        },
      },
    }),
  ]);
  const deviceDefaultLabel = workLocationLabel(
    deviceRow?.defaultWorkLocation,
    locale,
  );
  const enforced = deviceRow?.enforceWorkLocation ?? false;

  const allowedIds = stepRow
    ? await allowedWorkLocationIdsForStep(stepRow.processStepId)
    : null;
  if (allowedIds == null) {
    return {
      restricted: false,
      enforced,
      deviceAllowed: true,
      deviceDefaultLabel,
      allowed: [],
    };
  }

  const ids = [...allowedIds];
  const [locations, devices] = await Promise.all([
    prisma.workLocation.findMany({
      where: { id: { in: ids }, isActive: true },
      include: { group: { select: { name: true } } },
      orderBy: [{ groupId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.kioskDevice.findMany({
      where: { status: "ACTIVE", defaultWorkLocationId: { in: ids } },
      select: { name: true, defaultWorkLocationId: true },
    }),
  ]);
  const devicesByLocation = new Map<number, string[]>();
  for (const d of devices) {
    if (d.defaultWorkLocationId == null) continue;
    const names = devicesByLocation.get(d.defaultWorkLocationId) ?? [];
    const n = deviceName(d.name);
    if (n) names.push(n);
    devicesByLocation.set(d.defaultWorkLocationId, names);
  }
  return {
    restricted: true,
    enforced,
    deviceAllowed:
      deviceRow?.defaultWorkLocationId != null &&
      allowedIds.has(deviceRow.defaultWorkLocationId),
    deviceDefaultLabel,
    allowed: locations.map((l) => ({
      label: workLocationLabel(l, locale) ?? "—",
      deviceNames: devicesByLocation.get(l.id) ?? [],
    })),
  };
}
