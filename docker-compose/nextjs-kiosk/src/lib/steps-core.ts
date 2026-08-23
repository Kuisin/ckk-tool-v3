/**
 * steps-core.ts — 工程実行アプリの純ロジック（DB・React 非依存）。
 *
 * キオスク固有の導出だけを置く。ワークフローの共通ルール（canStartStep /
 * expectedInput / validateQuantities）は逐語コピーの workflow-core.ts 側にあり、
 * ここには**足さない**（あちらは原本と 1 バイト一致でなければならない）。
 *
 * 一時停止の表現について:
 * STEP_STATUS に PAUSED は無い。「進行中だが誰も掴んでいない」＝
 * IN_PROGRESS かつ session_locked_by IS NULL を PAUSED として導出する。
 * これで nextjs-web 側のロジック（isWorkOrderComplete / computeWipByStep /
 * 巻き戻しガード / 実績・検査記録の status ガード）を一切変更せずに済む。
 */

import {
  canStartStep,
  type QuantityTrackingMode,
  type WorkflowCtx,
} from "./workflow-core";

/** 画面が扱う工程の状態（status とロック保持者から導出）。 */
export type StepSessionState =
  | "STARTABLE" // 未着手・開始可
  | "BLOCKED" // 未着手・前工程待ち等で開始不可
  | "WORKING" // 進行中・自分が作業中
  | "PAUSED" // 進行中・一時停止（誰も掴んでいない）
  | "OTHER" // 進行中・他の人が作業中
  | "COMPLETED"
  | "CANCELLED";

export interface SessionStateInput {
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  sessionLockedBy: string | null;
}

/**
 * 工程の表示状態を導出する。PENDING の開始可否は workflow-core の
 * canStartStep（実行依存・分岐合流・ロック）に委ねる。
 */
export function stepSessionState(
  step: SessionStateInput & { id: string },
  ctx: WorkflowCtx,
  actorId: string,
): StepSessionState {
  if (step.status === "COMPLETED") return "COMPLETED";
  if (step.status === "CANCELLED") return "CANCELLED";
  if (step.status === "IN_PROGRESS") {
    if (step.sessionLockedBy == null) return "PAUSED";
    return step.sessionLockedBy === actorId ? "WORKING" : "OTHER";
  }
  return canStartStep(step.id, ctx, actorId).ok ? "STARTABLE" : "BLOCKED";
}

/** その状態で作業者が押せるアクション。 */
export function availableActions(
  state: StepSessionState,
): ("START" | "PAUSE" | "RESUME" | "COMPLETE")[] {
  switch (state) {
    case "STARTABLE":
      return ["START"];
    case "WORKING":
      return ["PAUSE", "COMPLETE"];
    case "PAUSED":
      return ["RESUME", "COMPLETE"];
    default:
      return [];
  }
}

export interface WorkSession {
  startedAt: Date | null;
  endedAt: Date | null;
}

/**
 * 累計作業時間 (ms)。open な行（endedAt = null）は now まで数える。
 * 一時停止のたびに 1 行閉じ、再開のたびに 1 行開くので、休憩を挟んだ
 * 実作業時間の合計になる。
 */
export function accumulatedWorkMs(
  sessions: readonly WorkSession[],
  now: Date,
): number {
  let total = 0;
  for (const s of sessions) {
    if (!s.startedAt) continue;
    const end = s.endedAt ?? now;
    const ms = end.getTime() - s.startedAt.getTime();
    if (ms > 0) total += ms;
  }
  return total;
}

/** ms → `H:MM` / `M:SS`（1 時間未満）。 */
export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 一覧のセクション分け。 */
export type StepBucket = "OVERDUE" | "TODAY" | "UPCOMING";

/**
 * 計画日（JST の YYYY-MM-DD 文字列）を今日基準で分類する。
 * 計画が無い（自分がロックだけ持っている）工程は本日扱い。
 */
export function bucketOf(
  plannedDate: string | null,
  todayJst: string,
): StepBucket {
  if (!plannedDate) return "TODAY";
  if (plannedDate < todayJst) return "OVERDUE";
  if (plannedDate > todayJst) return "UPCOMING";
  return "TODAY";
}

/** 状態の表示優先度（小さいほど上）。作業中 → 一時停止 → 開始可 → 待ち。 */
const STATE_RANK: Record<StepSessionState, number> = {
  WORKING: 0,
  PAUSED: 1,
  STARTABLE: 2,
  BLOCKED: 3,
  OTHER: 4,
  COMPLETED: 5,
  CANCELLED: 6,
};

export interface SortableStep {
  sessionState: StepSessionState;
  plannedDate: string | null;
  plannedStartAt: string | null;
  workOrderNumber: number;
  sortOrder: number;
}

/** 一覧の並び: 状態 → 計画日 → 計画開始時刻 → 指示書番号 → 工程順。 */
export function compareSteps(a: SortableStep, b: SortableStep): number {
  const r = STATE_RANK[a.sessionState] - STATE_RANK[b.sessionState];
  if (r !== 0) return r;
  const d = (a.plannedDate ?? "").localeCompare(b.plannedDate ?? "");
  if (d !== 0) return d;
  const t = (a.plannedStartAt ?? "").localeCompare(b.plannedStartAt ?? "");
  if (t !== 0) return t;
  if (a.workOrderNumber !== b.workOrderNumber)
    return a.workOrderNumber - b.workOrderNumber;
  return a.sortOrder - b.sortOrder;
}

export interface QuantityFormValues {
  inputQuantity: number;
  outputSuccessQuantity: number;
  outputDefectSemiFinished: number;
  outputDefectScrap: number;
  outputDefectRework: number;
}

/**
 * 完了フォームの初期値。受入数は開始時に確定した値で固定（完了時は編集不可）、
 * 不良は 0・良品 = 受入（不良なし）を既定にする。良品は導出値なので初期でも
 * deriveSuccess と一致する。
 */
export function quantityFormDefaults(
  inputQuantity: number | null,
): QuantityFormValues {
  const input = inputQuantity ?? 0;
  return {
    inputQuantity: input,
    outputSuccessQuantity: input,
    outputDefectSemiFinished: 0,
    outputDefectScrap: 0,
    outputDefectRework: 0,
  };
}

// ── 検査記録・不良記録（純ロジック） ─────────────────────────────────────────

export interface InspectionItemEntry {
  templateItemId: number;
  measuredValue: string;
  isPass: boolean;
}

/**
 * 検査記録の判定 — 全項目合格なら PASS、1 つでも不合格なら FAIL。
 * nextjs-web の saveInspectionRecord と同じ規則（サーバー側でも同判定）。
 */
export function inspectionOutcome(
  items: readonly { isPass: boolean }[],
): "PASS" | "FAIL" {
  return items.every((i) => i.isPass) ? "PASS" : "FAIL";
}

/**
 * 必須項目のうち実測値が未入力のものの id 列。
 * （空白のみは未入力扱い — nextjs-web の InspectionRecordForm と同じ）
 */
export function missingRequiredItems(
  items: readonly { id: number; isRequired: boolean }[],
  measuredValues: Readonly<Record<number, string | undefined>>,
): number[] {
  return items
    .filter((it) => it.isRequired && !(measuredValues[it.id] ?? "").trim())
    .map((it) => it.id);
}

export interface DefectEntry {
  defectTypeId: number | null;
  description: string;
}

/** 不良記録行が保存可能か（種類選択済み・内容が空白でない）。 */
export function isDefectEntryComplete(entry: DefectEntry): boolean {
  return entry.defectTypeId != null && entry.description.trim().length > 0;
}

// ── 不良の内訳（完了フォーム — {種別, 種類, 詳細, 数} の 1 本のリスト） ──────
//
// 作業者は不良を 1 行ずつ足す。各行に **種別（在庫区分）** と不良種類
// （defect_types FK・必須）・詳細（必須）・数を持ち、区分ごとの合計
// （半製品/廃棄/工程分岐）はこのリストの合計として導出する。在庫連携は
// 区分合計をそのまま使うので不変。良品 = 受入 − 総不良（全行の合計）。

/** 不良の在庫区分（在庫連携の権威。列 output_defect_* に対応）。 */
export type DefectDisposition = "SEMI" | "SCRAP" | "REWORK";
export const DEFECT_DISPOSITIONS: DefectDisposition[] = [
  "SEMI",
  "SCRAP",
  "REWORK",
];

export interface DefectReasonEntry {
  /** 種別（半製品/廃棄/工程分岐）。 */
  type: DefectDisposition;
  /** 不良種類（defect_types.id・必須）。旧データのみ null。 */
  defectTypeId: number | null;
  /** 詳細（必須テキスト）。旧データは不良種類名が入っていることがある。 */
  reason: string;
  /** 本数。 */
  count: number;
}

/** 行が集計対象か（種別が正当・数が 1 以上）。入力途中でも数は数える。 */
export function isReasonEntryCountable(e: DefectReasonEntry): boolean {
  return (
    DEFECT_DISPOSITIONS.includes(e.type) &&
    Number.isFinite(e.count) &&
    e.count > 0
  );
}

/** 行が保存可能か（集計対象 + 不良種類 FK + 詳細あり）。 */
export function isReasonEntryComplete(e: DefectReasonEntry): boolean {
  return (
    isReasonEntryCountable(e) &&
    e.defectTypeId != null &&
    Number.isInteger(e.defectTypeId) &&
    e.defectTypeId > 0 &&
    e.reason.trim() !== ""
  );
}

/** 区分ごとの合計（在庫列にそのまま入る）。集計対象外の行は無視。 */
export function dispositionTotals(entries: readonly DefectReasonEntry[]): {
  semi: number;
  scrap: number;
  rework: number;
} {
  let semi = 0;
  let scrap = 0;
  let rework = 0;
  for (const e of entries) {
    if (!isReasonEntryCountable(e)) continue;
    if (e.type === "SEMI") semi += e.count;
    else if (e.type === "SCRAP") scrap += e.count;
    else rework += e.count;
  }
  return { semi, scrap, rework };
}

/** 総不良数 = 全区分の合計。 */
export function defectListTotal(entries: readonly DefectReasonEntry[]): number {
  const { semi, scrap, rework } = dispositionTotals(entries);
  return semi + scrap + rework;
}

/** 良品数（導出）= 受入数 − 総不良数（下限 0）。 */
export function deriveSuccessFromList(
  inputQuantity: number,
  entries: readonly DefectReasonEntry[],
): number {
  return Math.max(0, inputQuantity - defectListTotal(entries));
}

/** サーバー送信用の数量（区分列 + 導出良品）をリストから組み立てる。 */
export function quantitiesFromList(
  inputQuantity: number,
  entries: readonly DefectReasonEntry[],
): QuantityFormValues {
  const { semi, scrap, rework } = dispositionTotals(entries);
  return {
    inputQuantity,
    outputSuccessQuantity: Math.max(0, inputQuantity - semi - scrap - rework),
    outputDefectSemiFinished: semi,
    outputDefectScrap: scrap,
    outputDefectRework: rework,
  };
}

/** 保存対象の行だけを取り出し、reason をトリムして返す。 */
export function cleanReasonEntries(
  entries: readonly DefectReasonEntry[],
): DefectReasonEntry[] {
  return entries.filter(isReasonEntryCountable).map((e) => ({
    type: e.type,
    defectTypeId: e.defectTypeId,
    reason: e.reason.trim(),
    count: e.count,
  }));
}

export type ConservationIssue =
  | { kind: "NEGATIVE" }
  | { kind: "OVER_INPUT"; sum: number; input: number }
  | { kind: "INCOMPLETE" };

/**
 * 完了フォームの数量検証（良品は導出値なので保存則の一致は常に成立）。
 * 不正は「負の値」「不良の合計が受入数を超える（良品が負になる）」
 * 「不良種類・詳細の未入力（必須）」。
 * 文言を持たずコードだけ返すので、i18n はコンポーネント側で行う。権威は
 * サーバー側 validateQuantities — こちらは即時フィードバック用。
 */
export function checkDefectList(
  entries: readonly DefectReasonEntry[],
  inputQuantity: number,
  mode: QuantityTrackingMode,
): ConservationIssue | null {
  if (mode === "NONE") return null;
  if (entries.some((e) => !Number.isFinite(e.count) || e.count < 0))
    return { kind: "NEGATIVE" };
  const sum = defectListTotal(entries);
  if (sum > inputQuantity)
    return { kind: "OVER_INPUT", sum, input: inputQuantity };
  if (
    entries.some((e) => isReasonEntryCountable(e) && !isReasonEntryComplete(e))
  )
    return { kind: "INCOMPLETE" };
  return null;
}
