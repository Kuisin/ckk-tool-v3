/**
 * step-batch-core.ts — 工程の一括操作の純ロジック（DB・React 非依存）。
 *
 * 1 人が複数の工程を同時に進めることは前から出来るが、画面を 1 つずつ開いて
 * 開始・完了するしかなかった。1 台の機械で同じ工程の指示書を何本も回すと、
 * その回数だけ往復することになる。ここは「どれを束ねてよいか」を決める側で、
 * 実際の書き込みは step-batch.ts、権威は常にサーバー。
 *
 * ★ **状態 → 操作の対応は availableActions（steps-core）から導く。**
 *   判定を二重に書くと、片方だけ直したときに画面とサーバーが食い違う。
 */

import { availableActions, type StepSessionState } from "./steps-core";
import type { LotInputMode, QuantityTrackingMode } from "./workflow-core";

/** 一括で扱う操作。**再開は v1 に入れない**（作業場所ゲートを伴うため）。 */
export type BatchAction = "START" | "PAUSE" | "COMPLETE";

const BATCH_ACTIONS: readonly BatchAction[] = ["START", "PAUSE", "COMPLETE"];

function isBatchAction(a: string): a is BatchAction {
  return (BATCH_ACTIONS as readonly string[]).includes(a);
}

/** その状態で一括操作の対象になれる操作。 */
export function batchActionsFor(state: StepSessionState): BatchAction[] {
  return availableActions(state).filter(isBatchAction);
}

/**
 * 選んだ工程すべてに共通する操作。**空 = 束ねられない組み合わせ**
 * （開始できる工程と作業中の工程が混ざっている等）。
 *
 * 黙って 2 回の呼び出しに分けない — タブレットではボタン 1 つ = 意味 1 つ。
 */
export function commonBatchActions(
  states: readonly StepSessionState[],
): BatchAction[] {
  if (states.length === 0) return [];
  let common = batchActionsFor(states[0]);
  for (const s of states.slice(1)) {
    const next = new Set<BatchAction>(batchActionsFor(s));
    common = common.filter((a) => next.has(a));
  }
  return common;
}

/** 一括に載せられない理由（画面が文言にする）。 */
export type BatchIneligibility =
  /** その状態ではその操作ができない。 */
  | "NOT_SELECTABLE"
  /** 開始にロット/伝票コードが要る（1 件ずつ入力する — 個別画面へ）。 */
  | "LOT_REQUIRED"
  /** 未記入の検査表がある（完了できない）。 */
  | "INSPECTION_REQUIRED";

/** 一括の可否判定に要る 1 行分。 */
export interface BatchCandidate {
  stepId: string;
  sessionState: StepSessionState;
  /** 実効ロット入力モード（上書き → カタログ既定を解決済み）。 */
  lotInputMode: LotInputMode;
  quantityMode: QuantityTrackingMode;
  inspectionMissing: boolean;
}

/**
 * その行をその操作で一括に載せられるか。載せられないなら理由。
 *
 * **サーバーの判定を先取りするだけの助言**で、権威は API 側
 * （LOT_REQUIRED / INSPECTION_REQUIRED / NOT_STARTABLE …）。画面が古い値で
 * 描いていることもあるので、ここを通っても失敗することはある。
 */
export function batchIneligibility(
  row: BatchCandidate,
  action: BatchAction,
): BatchIneligibility | null {
  if (!batchActionsFor(row.sessionState).includes(action)) {
    return "NOT_SELECTABLE";
  }
  if (action === "START" && row.lotInputMode === "REQUIRED") {
    // ロットは 1 件ずつ違う値なので、まとめて 1 つの確認では入れられない。
    // 欄が並ぶ場所は工程まとめ画面のほう。
    return "LOT_REQUIRED";
  }
  if (action === "COMPLETE" && row.inspectionMissing) {
    return "INSPECTION_REQUIRED";
  }
  return null;
}

/** 一括に載る行と、載らない行（理由つき）に分ける。 */
export function partitionForBatch(
  rows: readonly BatchCandidate[],
  action: BatchAction,
): {
  eligible: BatchCandidate[];
  rejected: { row: BatchCandidate; reason: BatchIneligibility }[];
} {
  const eligible: BatchCandidate[] = [];
  const rejected: { row: BatchCandidate; reason: BatchIneligibility }[] = [];
  for (const row of rows) {
    const reason = batchIneligibility(row, action);
    if (reason == null) eligible.push(row);
    else rejected.push({ row, reason });
  }
  return { eligible, rejected };
}

/**
 * 一括完了で「不良の入力」が要る工程か。
 *
 * v1 の一括完了は **全数良品**（良品 = 受入）でしか通さない。サーバーは
 * 種類 FK + 詳細の無い不良を拒否する（DEFECT_REASONS_REQUIRED）ので、
 * 不良数だけ打たせる道はそもそも無く、不良がある工程は 1 件ずつ開いて
 * 内訳を入れてもらう。数量を数えない工程（NONE）は元から入力が要らない。
 */
export function completesAsAllGood(row: BatchCandidate): boolean {
  return row.quantityMode !== "NONE";
}

/** 一括操作の結果 1 件（サーバーの応答と同じ形）。 */
export interface BatchResult {
  stepId: string;
  ok: boolean;
  codes?: string[];
  errors?: string[];
}

/** 結果のまとめ。 */
export function summarizeBatch(results: readonly BatchResult[]): {
  succeeded: number;
  failed: number;
  failedIds: string[];
} {
  const failedIds = results.filter((r) => !r.ok).map((r) => r.stepId);
  return {
    succeeded: results.length - failedIds.length,
    failed: failedIds.length,
    failedIds,
  };
}

/** 同じ工程（process_step_id）でまとまった一覧。 */
export interface ProcessStepGroup<T> {
  processStepId: number;
  stepName: string;
  rows: T[];
}

/**
 * 同じ工程の行をまとめる。**鍵は processStepId で、工程名ではない** —
 * 名前は多言語 Json を 1 言語に潰した値なので、別のカタログ行が或る言語で
 * だけ同名になり得る。1 件しかない工程はまとめない（束ねる意味が無い）。
 */
export function groupByProcessStep<
  T extends { processStepId: number; stepName: string },
>(rows: readonly T[]): ProcessStepGroup<T>[] {
  const byId = new Map<number, ProcessStepGroup<T>>();
  for (const row of rows) {
    const g = byId.get(row.processStepId);
    if (g) g.rows.push(row);
    else
      byId.set(row.processStepId, {
        processStepId: row.processStepId,
        stepName: row.stepName,
        rows: [row],
      });
  }
  return [...byId.values()].filter((g) => g.rows.length > 1);
}
