/**
 * step-defects.ts — 完了時の不良入力（{種別, 種類, 詳細, 数} の 1 本のリスト）の純ロジック。
 *
 * キオスク（nextjs-kiosk/src/lib/steps-core.ts）と同じモデル。作業者は不良を
 * 1 行ずつ足し、各行に 種別（在庫区分）・不良種類（defect_types FK・必須）・
 * 詳細（必須）・数 を持つ。区分ごとの合計（半製品/廃棄/工程分岐）はこのリストの
 * 合計として導出し、在庫連携の列にそのまま入る（在庫ロジックは不変）。
 * 良品 = 受入 − 総不良。
 */

import type { QuantityTrackingMode } from "./workflow-core";

/** 不良の在庫区分（列 output_defect_* に対応）。 */
export type DefectDisposition = "SEMI" | "SCRAP" | "REWORK";
export const DEFECT_DISPOSITIONS: DefectDisposition[] = [
  "SEMI",
  "SCRAP",
  "REWORK",
];

export interface DefectReasonEntry {
  type: DefectDisposition;
  /** 不良種類（defect_types.id・必須）。旧データのみ null。 */
  defectTypeId: number | null;
  /** 詳細（必須テキスト）。旧データは不良種類名が入っていることがある。 */
  reason: string;
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

export interface StepQuantities {
  inputQuantity: number;
  outputSuccessQuantity: number;
  outputDefectSemiFinished: number;
  outputDefectScrap: number;
  outputDefectRework: number;
}

/** サーバー送信用の数量（区分列 + 導出良品）をリストから組み立てる。 */
export function quantitiesFromList(
  inputQuantity: number,
  entries: readonly DefectReasonEntry[],
): StepQuantities {
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

export type DefectListIssue =
  | { kind: "NEGATIVE" }
  | { kind: "OVER_INPUT"; sum: number; input: number }
  | { kind: "INCOMPLETE" };

/**
 * 完了フォームの数量検証（良品は導出値なので保存則の一致は常に成立）。
 * 不正は「負の値」「不良の合計が受入数を超える（良品が負になる）」
 * 「不良種類・詳細の未入力（必須）」。
 */
export function checkDefectList(
  entries: readonly DefectReasonEntry[],
  inputQuantity: number,
  mode: QuantityTrackingMode,
): DefectListIssue | null {
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
