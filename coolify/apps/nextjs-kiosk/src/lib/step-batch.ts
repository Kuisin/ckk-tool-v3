/**
 * step-batch.ts — 工程の一括操作（開始 / 一時停止 / 完了）。server-only.
 *
 * **バッチは 1 つの原子的な単位ではなく、N 個の独立した操作**。部分失敗が普通の
 * 状態（前工程待ち・他端末に取られた・検査表未記入）で、全か無かにすると
 * 機能そのものが死ぬ。原子性は既にある場所——工程ごとの条件付き claim と、
 * 指示書完了 + 在庫計上の対——にそのまま残る。
 *
 * ★ **開始だけは既存関数のループにしない。** resegmentOpenActuals の不変条件は
 *   「1 実績行 = 同時数が一定の区間」で、開始を N 回ループすると毎回
 *   同時数が 1 ずつ増え、**N(N+1)/2 行**（N=5 で 15 行、うち 10 行はミリ秒の
 *   欠片）が実績表に残る。値としては正しいが、実績を読む側にはただのゴミ。
 *   だから now を 1 つに固定し、claim → create → **張り直しは最後に 1 回**にする。
 *
 * ★ **完了は completeStepExecution をそのまま 1 件ずつ呼ぶ。** あちらは数量の
 *   保存則・検査表ゲート・分岐の数量伝播・指示書完了の条件付きフリップ・
 *   在庫計上（onWorkOrderCompletedTx）まで持っている。ここで書き写すと、
 *   一番間違えてはいけないもの（在庫）を二重定義することになる。同時数の
 *   張り直しは完了のたびに走るが、それは**実際に同時数が減った**という
 *   正しい記録で、開始側のような嘘の行は生まれない。
 */

import { recordAudit } from "./audit";
import { prisma } from "./db";
import { jstDateOnly } from "./format";
import { encodeInventoryNote } from "./inventory-note-core";
import {
  canOperateStep,
  completeStepExecution,
  fetchWorkflowCtx,
  resegmentOpenActuals,
  type StepActionResult,
} from "./step-execution";
import {
  canStartStep,
  effectiveLotInputMode,
  expectedInput,
} from "./workflow-core";

/** 一括操作の 1 件分の結果（単一操作の応答と同じ形）。 */
export interface BatchStepResult extends StepActionResult {
  stepId: string;
}

export interface BatchOutcome {
  ok: boolean;
  summary: { succeeded: number; failed: number };
  results: BatchStepResult[];
}

const failFor = (
  stepId: string,
  code: string,
  ...errors: string[]
): BatchStepResult => ({
  stepId,
  ok: false,
  codes: [code as never],
  errors: errors.length > 0 ? errors : undefined,
});

function outcomeOf(results: BatchStepResult[]): BatchOutcome {
  const failed = results.filter((r) => !r.ok).length;
  return {
    ok: failed === 0,
    summary: { succeeded: results.length - failed, failed },
    results,
  };
}

/** 行レベルゲート（canOperateStep）を工程ごとに通す。 */
async function rejectUnassigned(
  stepIds: string[],
  actorId: string,
): Promise<{ allowed: string[]; rejected: BatchStepResult[] }> {
  const checks = await Promise.all(
    stepIds.map(async (id) => [id, await canOperateStep(id, actorId)] as const),
  );
  const allowed: string[] = [];
  const rejected: BatchStepResult[] = [];
  for (const [id, ok] of checks) {
    if (ok) allowed.push(id);
    else rejected.push(failFor(id, "NOT_ASSIGNED"));
  }
  return { allowed, rejected };
}

// ── 一括開始 ────────────────────────────────────────────────────────────────

/** 一括開始で 1 工程に渡せるもの。 */
export interface BatchStartItem {
  stepId: string;
  /** 実績に記録する作業場所（解決済み。API 側が端末既定 or 読み取り QR から決める）。 */
  workLocationId?: number | null;
}

/**
 * 一括開始。受入数は**常に想定受入数**（expectedInput）で開始する — 1 件ずつ
 * 違う値を 1 つの確認画面では入れられないため。上書きしたい工程は個別に開く。
 * ロット必須の工程も同じ理由で対象外（API 側で LOT_REQUIRED を返す）。
 */
export async function startStepsBatch(
  items: readonly BatchStartItem[],
  actorId: string,
): Promise<BatchOutcome> {
  const { allowed, rejected } = await rejectUnassigned(
    items.map((i) => i.stepId),
    actorId,
  );
  const allowedSet = new Set(allowed);
  const results: BatchStepResult[] = [...rejected];

  // ── 事前検証はトランザクションの外で（今の startStepExecution と同じ順）。
  // 投げ得るものを中に持ち込まない。
  type Ready = {
    stepId: string;
    workOrderId: string;
    workOrderNumber: number;
    workOrderStatus: string;
    sortOrder: number;
    input: number | null;
    workLocationId: number | null;
  };
  const ready: Ready[] = [];

  for (const item of items) {
    if (!allowedSet.has(item.stepId)) continue;
    const stepRow = await prisma.workOrderStep.findUnique({
      where: { id: item.stepId },
      include: {
        workOrder: {
          select: { id: true, workOrderNumber: true, status: true },
        },
        processStep: { select: { lotInputMode: true } },
      },
    });
    if (!stepRow) {
      results.push(failFor(item.stepId, "NOT_FOUND"));
      continue;
    }
    if (
      stepRow.workOrder.status !== "APPROVED" &&
      stepRow.workOrder.status !== "IN_PROGRESS"
    ) {
      results.push(failFor(item.stepId, "WO_NOT_APPROVED"));
      continue;
    }
    const { ctx } = await fetchWorkflowCtx(stepRow.workOrderId);
    const check = canStartStep(item.stepId, ctx, actorId);
    if (!check.ok) {
      results.push(failFor(item.stepId, "NOT_STARTABLE", ...check.reasons));
      continue;
    }
    // ロット必須は一括に載せない（1 件ずつ違う値を入れる欄が無い）
    const lotMode = effectiveLotInputMode(
      stepRow.lotInputMode,
      stepRow.processStep.lotInputMode,
    );
    if (lotMode === "REQUIRED") {
      results.push(failFor(item.stepId, "LOT_REQUIRED"));
      continue;
    }
    ready.push({
      stepId: item.stepId,
      workOrderId: stepRow.workOrderId,
      workOrderNumber: stepRow.workOrder.workOrderNumber,
      workOrderStatus: stepRow.workOrder.status,
      sortOrder: stepRow.sortOrder,
      input: expectedInput(item.stepId, ctx),
      workLocationId: item.workLocationId ?? null,
    });
  }

  if (ready.length === 0) return outcomeOf(results);

  // ── 1 トランザクション: claim を全部 → 実績行を全部 → 張り直しを 1 回。
  // now は 1 つ。claim は負けても throw せず count:0 を返すので、1 件の負けが
  // 他を巻き込まない。stepId 昇順は別端末の同時バッチとのデッドロック回避。
  const now = new Date();
  const ordered = [...ready].sort((a, b) => a.stepId.localeCompare(b.stepId));
  const claimed = await prisma.$transaction(async (tx) => {
    const openBefore = await tx.workOrderStepActual.count({
      where: { userId: actorId, endedAt: null },
    });

    const won: Ready[] = [];
    for (const r of ordered) {
      const c = await tx.workOrderStep.updateMany({
        where: {
          id: r.stepId,
          status: "PENDING",
          OR: [{ sessionLockedBy: null }, { sessionLockedBy: actorId }],
        },
        data: {
          status: "IN_PROGRESS",
          sessionLockedBy: actorId,
          sessionLockedAt: now,
          startedAt: now,
          startedBy: actorId,
          inputQuantity: r.input ?? undefined,
        },
      });
      if (c.count === 1) won.push(r);
    }
    if (won.length === 0) return won;

    // 新しい行は**最初から最終的な同時数**で開く。あとで張り直さずに済む。
    const n = openBefore + won.length;
    for (const r of won) {
      await tx.workOrderStepActual.create({
        data: {
          stepId: r.stepId,
          userId: actorId,
          workedDate: jstDateOnly(now),
          startedAt: now,
          workLocationId: r.workLocationId,
          concurrentCount: n,
          createdBy: actorId,
        },
      });
    }
    // 既存の open 行だけを 1 回で張り直す（新しい行は同時数が一致するので飛ばされる）
    if (openBefore > 0) await resegmentOpenActuals(tx, actorId, now);
    return won;
  });

  const wonIds = new Set(claimed.map((r) => r.stepId));
  for (const r of ready) {
    if (!wonIds.has(r.stepId)) results.push(failFor(r.stepId, "LOCK_TAKEN"));
  }

  // 最初の工程開始で指示書を進行中に（指示書ごとに 1 回）
  for (const woId of new Set(
    claimed
      .filter((r) => r.workOrderStatus === "APPROVED")
      .map((r) => r.workOrderId),
  )) {
    await prisma.workOrder.updateMany({
      where: { id: woId, status: "APPROVED" },
      data: { status: "IN_PROGRESS", startedAt: now },
    });
  }

  // 監査は工程ごとに 1 行（単一操作と同じ鍵・同じ形）
  for (const r of claimed) {
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(r.workOrderNumber),
      recordKey: r.workOrderId,
      after: {
        note: encodeInventoryNote("stepStarted", {
          sortOrder: r.sortOrder,
          input: r.input ?? "—",
        }),
      },
    });
    results.push({ stepId: r.stepId, ok: true });
  }

  return outcomeOf(results);
}

// ── 一括一時停止 ────────────────────────────────────────────────────────────

/**
 * 一括一時停止。開始と同じ形（1 トランザクション + 最後に 1 回張り直し）。
 * STEP_STATUS は IN_PROGRESS のまま — 一時停止は「ロックを離す」ことで表す。
 */
export async function pauseStepsBatch(
  stepIds: readonly string[],
  actorId: string,
): Promise<BatchOutcome> {
  const { allowed, rejected } = await rejectUnassigned([...stepIds], actorId);
  const results: BatchStepResult[] = [...rejected];
  if (allowed.length === 0) return outcomeOf(results);

  const rows = await prisma.workOrderStep.findMany({
    where: { id: { in: allowed } },
    select: {
      id: true,
      sortOrder: true,
      status: true,
      workOrder: { select: { id: true, workOrderNumber: true } },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of allowed) {
    if (!byId.has(id)) results.push(failFor(id, "NOT_FOUND"));
  }
  const targets = rows.filter((r) => {
    if (r.status !== "IN_PROGRESS") {
      results.push(failFor(r.id, "NOT_IN_PROGRESS"));
      return false;
    }
    return true;
  });
  if (targets.length === 0) return outcomeOf(results);

  const now = new Date();
  const ids = targets.map((r) => r.id).sort();
  const released = await prisma.$transaction(async (tx) => {
    const won: string[] = [];
    for (const id of ids) {
      const c = await tx.workOrderStep.updateMany({
        where: { id, status: "IN_PROGRESS", sessionLockedBy: actorId },
        data: { sessionLockedBy: null, sessionLockedAt: null },
      });
      if (c.count === 1) won.push(id);
    }
    if (won.length === 0) return won;
    await tx.workOrderStepActual.updateMany({
      where: { stepId: { in: won }, userId: actorId, endedAt: null },
      data: { endedAt: now },
    });
    // 残った open 区間の同時数を 1 回で張り直す
    await resegmentOpenActuals(tx, actorId, now);
    return won;
  });

  const wonSet = new Set(released);
  for (const r of targets) {
    if (!wonSet.has(r.id)) {
      results.push(failFor(r.id, "LOCK_HELD_BY_OTHER"));
      continue;
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(r.workOrder.workOrderNumber),
      recordKey: r.workOrder.id,
      after: {
        note: encodeInventoryNote("stepPaused", { sortOrder: r.sortOrder }),
      },
    });
    results.push({ stepId: r.id, ok: true });
  }

  return outcomeOf(results);
}

// ── 一括完了 ────────────────────────────────────────────────────────────────

/**
 * 一括完了。**全数良品**（良品 = 受入）でのみ通す。
 *
 * サーバーは種類 FK + 詳細の無い不良を拒否する（DEFECT_REASONS_REQUIRED）ので、
 * 「不良数だけ打って進む」道はそもそも無い。不良のある工程は 1 件ずつ開いて
 * 内訳を入れてもらう（画面もそう案内する）。
 *
 * 実装は **completeStepExecution をそのまま 1 件ずつ呼ぶ**。あちらが数量の
 * 保存則・検査表ゲート・分岐の数量伝播・指示書完了の条件付きフリップ・在庫計上を
 * 持っており、ここで書き写すと一番間違えてはいけないものを二重定義することに
 * なる。工程間の依存（同じ指示書の前後）も、1 件ずつ順に当てるので自然に解ける。
 * 同じ指示書の工程は工程順に処理する。
 */
export async function completeStepsBatch(
  stepIds: readonly string[],
  actorId: string,
): Promise<BatchOutcome> {
  const { allowed, rejected } = await rejectUnassigned([...stepIds], actorId);
  const results: BatchStepResult[] = [...rejected];
  if (allowed.length === 0) return outcomeOf(results);

  // 同じ指示書の中は工程順に。前の工程の良品数が次の工程の受入数になるので、
  // 順番が逆だと受入数が未確定のまま完了してしまう。
  const rows = await prisma.workOrderStep.findMany({
    where: { id: { in: allowed } },
    select: {
      id: true,
      sortOrder: true,
      workOrderId: true,
      inputQuantity: true,
      processStep: { select: { quantityTracking: true } },
    },
    orderBy: [{ workOrderId: "asc" }, { sortOrder: "asc" }],
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of allowed) {
    if (!byId.has(id)) results.push(failFor(id, "NOT_FOUND"));
  }

  for (const r of rows) {
    // 数量を数えない工程は completeStepExecution が受入数を導いてくれる。
    // 数える工程は「全数良品」— 受入数は完了時点で再計算されたものが権威なので
    // ここでは触らず、不良 0 の内訳リストだけを渡す。
    const mode = r.processStep.quantityTracking;
    const res =
      mode === "NONE"
        ? await completeStepExecution(r.id, actorId, null, null)
        : await completeStepExecution(
            r.id,
            actorId,
            {
              // 受入数の権威はサーバー側（想定受入 → 開始時の値）。ここで渡す値は
              // どちらも取れなかったときの最後の手掛かりにしかならない。
              inputQuantity: r.inputQuantity ?? 0,
              outputSuccessQuantity: r.inputQuantity ?? 0,
              outputDefectSemiFinished: 0,
              outputDefectScrap: 0,
              outputDefectRework: 0,
            },
            [],
          );
    results.push({ ...res, stepId: r.id });
  }

  return outcomeOf(results);
}
