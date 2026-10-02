/**
 * price-scale-preset.ts — 数量スケールのプリセット（価格表の既定の数量段階）。
 *
 * 「何本から何倍にするか」を 1 つの表で持ち、価格表（SA02）で新しいバリアントを
 * 作るときの初期値になる。以前は価格試算のエンジンにロット割引率として埋め込まれて
 * いたもの（旧 DISCOUNT_TIERS）を、管理者が編集できる設定へ独立させた。
 *
 * 持つのは「開始数量 + 倍率」だけ。終了数量は**次の行の開始数量 − 1** から導く
 * （最後の行は上限なし）。範囲を 1 本ずつ持たせると、隙間（どの行にも当たらない
 * 数量）と重なり（2 行に当たる数量）を作れてしまうため — 税率の履歴を「開始日だけ
 * 持つ」形にしているのと同じ理由。
 *
 * 純粋関数のみ（クライアントでもサーバーでも使う）。
 */

export interface ScalePresetRow {
  /** この数量から適用（最初の行は必ず 1）。 */
  minQuantity: number;
  /** 数量倍率（1.02 = 基準単価の 2% 増し、0.85 = 15% 引き）。 */
  multiplier: number;
}

/** 価格表の数量段階へ渡すときの形（終了数量を導出済み）。 */
export interface ScalePresetRange extends ScalePresetRow {
  maxQuantity: number | null;
}

/** 旧ロット割引率の表（Excel「丸棒見積」Z29:AC36）をそのまま引き継いだ既定値。 */
export const DEFAULT_SCALE_PRESET: readonly ScalePresetRow[] = [
  { minQuantity: 1, multiplier: 1.02 },
  { minQuantity: 6, multiplier: 1.01 },
  { minQuantity: 21, multiplier: 1.0 },
  { minQuantity: 31, multiplier: 0.98 },
  { minQuantity: 51, multiplier: 0.96 },
  { minQuantity: 101, multiplier: 0.94 },
  { minQuantity: 201, multiplier: 0.91 },
  { minQuantity: 301, multiplier: 0.88 },
  { minQuantity: 501, multiplier: 0.85 },
];

export const MIN_SCALE_MULTIPLIER = 0.01;

/** 検証結果。文言は呼び出し側（画面 / Server Action）が翻訳する。 */
export type ScalePresetIssue =
  | { kind: "empty" }
  | { kind: "firstNotOne" }
  | { kind: "notInteger"; index: number }
  | { kind: "notAscending"; index: number }
  | { kind: "badMultiplier"; index: number };

/** 先頭から見て最初の問題を返す（問題なしは null）。 */
export function validateScalePreset(
  rows: readonly ScalePresetRow[],
): ScalePresetIssue | null {
  if (rows.length === 0) return { kind: "empty" };
  if (rows[0].minQuantity !== 1) return { kind: "firstNotOne" };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!Number.isInteger(r.minQuantity) || r.minQuantity < 1) {
      return { kind: "notInteger", index: i };
    }
    if (i > 0 && r.minQuantity <= rows[i - 1].minQuantity) {
      return { kind: "notAscending", index: i };
    }
    if (!Number.isFinite(r.multiplier) || r.multiplier < MIN_SCALE_MULTIPLIER) {
      return { kind: "badMultiplier", index: i };
    }
  }
  return null;
}

/** 開始数量の昇順に並べ、終了数量（次の行の開始 − 1）を付ける。 */
export function scalePresetRanges(
  rows: readonly ScalePresetRow[],
): ScalePresetRange[] {
  const sorted = [...rows].sort((a, b) => a.minQuantity - b.minQuantity);
  return sorted.map((r, i) => ({
    ...r,
    maxQuantity: i < sorted.length - 1 ? sorted[i + 1].minQuantity - 1 : null,
  }));
}

/** 単価 = 基準単価 × 倍率（円未満は四捨五入。価格表の tierUnitPrice と同じ丸め）。 */
export function scalePresetUnitPrice(
  baseUnitPrice: number,
  multiplier: number,
): number {
  return Math.round(baseUnitPrice * multiplier);
}

/** 保存値（unknown）を行の配列へ。形が違えば null（呼び出し側が既定へ倒す）。 */
export function parseScalePreset(value: unknown): ScalePresetRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: ScalePresetRow[] = [];
  for (const v of value) {
    if (typeof v !== "object" || v === null) return null;
    const { minQuantity, multiplier } = v as Record<string, unknown>;
    if (typeof minQuantity !== "number" || typeof multiplier !== "number") {
      return null;
    }
    rows.push({ minQuantity, multiplier });
  }
  return validateScalePreset(rows) ? null : rows;
}

type MessageFn = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/** 問題を画面 / Server Action 共通の文言にする（`tr` は next-intl の翻訳関数）。 */
export function scalePresetIssueMessage(
  issue: ScalePresetIssue,
  tr: MessageFn,
): string {
  switch (issue.kind) {
    case "empty":
      return tr("settings.scalePreset.issueEmpty");
    case "firstNotOne":
      return tr("settings.scalePreset.issueFirstNotOne");
    case "notInteger":
      return tr("settings.scalePreset.issueNotInteger", {
        row: issue.index + 1,
      });
    case "notAscending":
      return tr("settings.scalePreset.issueNotAscending", {
        row: issue.index + 1,
      });
    case "badMultiplier":
      return tr("settings.scalePreset.issueBadMultiplier", {
        row: issue.index + 1,
      });
  }
}
