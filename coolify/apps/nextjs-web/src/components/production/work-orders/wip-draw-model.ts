/**
 * wip-draw-model.ts — 指示書ビルダーの「使える仕掛品」の選択状態（client-safe）。
 *
 * 規則は lib/wip-state-core.ts（validateWipDraws / planWipStart）が持ち、
 * サーバー（lib/work-order-wip.ts）が保存のときに同じ関数で確かめ直す。ここは
 * 画面の選択を、その関数へ渡す形と、画面に見せる形へ畳むだけ。
 */

import { validateWipDraws, type WipDrawIssue } from "@/lib/wip-state-core";
// type-only import — lib/work-order-wip は server-only（型はバンドルされない）。
import type {
  WipCandidateGroup,
  WipCandidateRow,
  WipCandidatesView,
} from "@/lib/work-order-wip";

/** 画面の選択。 */
export interface WipDrawSelection {
  /** 在庫バケット id → 投入する数量。 */
  draws: Record<string, number>;
  /** 加工状態が合わない仕掛品（その他）を使う理由。 */
  overrideReason: string;
  /** 仕掛品で済んでいるが、この指示書でもう一度行う工程（カタログ id）。 */
  redoStepIds: number[];
}

export const EMPTY_WIP_SELECTION: WipDrawSelection = {
  draws: {},
  overrideReason: "",
  redoStepIds: [],
};

/** 候補の並び — 3 つの区分は別々に見せる（利用者の決定）。その他は最後。 */
export const WIP_GROUP_ORDER: readonly WipCandidateGroup[] = [
  "exact",
  "longer",
  "largerDiameter",
  "other",
];

export function wipCandidateRows(
  view: WipCandidatesView | null,
): WipCandidateRow[] {
  if (!view) return [];
  return WIP_GROUP_ORDER.flatMap((g) => view[g]);
}

export interface WipSelectionState {
  /** 選んだ行（区分の順）。 */
  selected: { row: WipCandidateRow; quantity: number }[];
  /** 選んだのに候補に無いバケット（もう在庫に無い等）。 */
  missingIds: string[];
  issues: WipDrawIssue[];
  total: number;
  needsOverride: boolean;
  /** 飛ばせる工程（選んだ仕掛品の加工状態で済んでいる分）。 */
  skippableStepIds: number[];
  /** 実際に飛ばす工程（飛ばせる工程 − もう一度行う工程）。 */
  skippedStepIds: number[];
  /** 長い・太い仕掛品を選んでいる（寸法を合わせる工程が残っているか確かめる）。 */
  hasOversize: boolean;
}

/**
 * 選択の現況。`view` がまだ無い（読み込み中）ときは検証しない —
 * 候補が分からないうちに「候補に無い」と言わない。
 */
export function wipSelectionState(
  view: WipCandidatesView | null,
  selection: WipDrawSelection,
): WipSelectionState {
  const ids = Object.keys(selection.draws);
  const empty: WipSelectionState = {
    selected: [],
    missingIds: [],
    issues: [],
    total: 0,
    needsOverride: false,
    skippableStepIds: [],
    skippedStepIds: [],
    hasOversize: false,
  };
  if (ids.length === 0 || !view) return empty;
  const rows = wipCandidateRows(view);
  const rowOf = new Map(rows.map((r) => [r.id, r]));
  const selected = rows
    .filter((r) => r.id in selection.draws)
    .map((row) => ({ row, quantity: selection.draws[row.id] }));
  const checked = validateWipDraws(
    ids.map((inventoryId) => ({
      inventoryId,
      quantity: selection.draws[inventoryId],
    })),
    rows.map((r) => ({
      inventoryId: r.id,
      wipStateId: r.wipStateId,
      group: r.group,
      available: r.available,
    })),
    selection.overrideReason,
  );
  const skippableStepIds = selected[0]?.row.skippableStepIds ?? [];
  const redo = new Set(selection.redoStepIds);
  return {
    selected,
    missingIds: ids.filter((id) => !rowOf.has(id)),
    issues: checked.issues,
    total: checked.total,
    needsOverride: checked.needsOverride,
    skippableStepIds,
    skippedStepIds: skippableStepIds.filter((id) => !redo.has(id)),
    hasOversize: selected.some(
      (s) => s.row.group === "longer" || s.row.group === "largerDiameter",
    ),
  };
}

/** 保存の要求に載せる形（区分の順 = 完了のときに落とす順）。 */
export function wipDrawPayload(
  view: WipCandidatesView | null,
  selection: WipDrawSelection,
): {
  wipDraws: { inventoryId: string; quantity: number }[];
  wipOverrideReason: string | null;
  wipRedoStepIds: number[];
} {
  const state = wipSelectionState(view, selection);
  const ordered = state.selected.map((s) => ({
    inventoryId: s.row.id,
    quantity: s.quantity,
  }));
  // 候補が読めていない・候補に無いバケットもそのまま送る（サーバーが拒む）。
  const known = new Set(ordered.map((d) => d.inventoryId));
  const rest = Object.entries(selection.draws)
    .filter(([id]) => !known.has(id))
    .map(([inventoryId, quantity]) => ({ inventoryId, quantity }));
  const wipDraws = [...ordered, ...rest];
  return {
    wipDraws,
    wipOverrideReason:
      wipDraws.length > 0 && selection.overrideReason.trim()
        ? selection.overrideReason.trim()
        : null,
    wipRedoStepIds: wipDraws.length > 0 ? selection.redoStepIds : [],
  };
}
