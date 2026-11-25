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
import { type Criterion, criterionCostMode } from "./trial-pricing-criteria";

/** 原価を見る権限のコード（READ で判定する）。 */
export const ESTIMATE_COST_PERMISSION = "estimate_cost";

/** 結果スナップショットから原価の情報（基準ごとの値・原価合計）を落とす。 */
export function withoutCost<T extends Partial<TrialResult>>(
  result: T,
): Omit<T, "items" | "costTotal"> {
  const { items: _items, costTotal: _costTotal, ...rest } = result;
  return rest;
}

/**
 * 計算基準から原価の印を落とす。
 *
 * 「原価のみに含める」基準は印を落とすと小計に足されてしまい、権限の無い人の
 * 画面だけ見積単価が変わる。そこで `intermediate`（小計に足さない役割）へ
 * 読み替えてから渡す — 計算結果（見積単価）は同じで、「これは原価だけの項目だ」
 * という情報も残らない。
 */
export function withoutCostFlags(criteria: readonly Criterion[]): Criterion[] {
  return criteria.map(({ isCost: _isCost, costOnly: _costOnly, ...c }) =>
    criterionCostMode({
      role: c.role,
      isCost: _isCost,
      costOnly: _costOnly,
    }) === "costOnly"
      ? { ...c, role: "intermediate" as const }
      : c,
  );
}

/** 価格試算の種別（DB の ESTIMATE_KIND）。 */
export type EstimateKind = "COST" | "PRICE";

/**
 * この種別の価格試算を見てよいか。原価試算は中身がそのまま原価なので、
 * 権限 estimate_cost の無い人には**行ごと**見せない（一覧・詳細・関連の検索とも）。
 */
export function canSeeEstimateKind(
  kind: EstimateKind,
  canViewCost: boolean,
): boolean {
  return kind === "PRICE" || canViewCost;
}

/** Prisma の where に足す種別の絞り込み（権限が無ければ売価試算だけ）。 */
export function estimateKindWhere(canViewCost: boolean): {
  kind?: EstimateKind;
} {
  return canViewCost ? {} : { kind: "PRICE" };
}
