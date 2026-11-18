/**
 * estimate-cost.ts — 価格試算の「原価」を誰に見せるか。
 *
 * 原価合計・粗利と、計算基準ごとの原価の印は**権限 `estimate_cost`（READ）を
 * 持つ人だけ**に見せる（既定では管理職ロールだけ — migration
 * 20261112090000_estimate_cost_permission）。持たない人には、画面の行を消すだけで
 * なく**サーバーからクライアントへ渡す前に値ごと落とす** — 行を隠しても props に
 * 載っていれば開発者ツールで読めるため。
 *
 * 計算そのもの（見積単価）は印に依らないので、落としても金額は変わらない。
 * 純関数・client-safe（判定はページ側で checkPermission を呼んでここへ渡す）。
 */

import type { TrialResult } from "./trial-pricing";
import type { Criterion } from "./trial-pricing-criteria";

/** 原価を見る権限のコード（READ で判定する）。 */
export const ESTIMATE_COST_PERMISSION = "estimate_cost";

/** 結果スナップショットから原価の情報（基準ごとの値・原価合計）を落とす。 */
export function withoutCost<T extends Partial<TrialResult>>(
  result: T,
): Omit<T, "items" | "costTotal"> {
  const { items: _items, costTotal: _costTotal, ...rest } = result;
  return rest;
}

/** 計算基準から原価の印を落とす（見積単価の計算には効かない項目）。 */
export function withoutCostFlags(criteria: readonly Criterion[]): Criterion[] {
  return criteria.map(({ isCost: _isCost, ...c }) => c);
}
