/**
 * process-route-kinds.ts — 工程マスタの工程が「どの工程リストに入れられるか」
 * を画面に出すための導出（純ロジック・web だけ）。
 *
 * 判定そのものは workflow-core.ts（キオスクとの twin file）の関数をそのまま
 * 使う — ここで規則を作り直さない:
 *
 *   準備     … 材料準備カテゴリ（isPrepStep）
 *   製造     … 準備でも再研磨カテゴリでもない工程（再研磨カテゴリの工程は
 *              再研磨の指示書にしか載らない — validate の REGRIND_FORBIDDEN）
 *   再研磨   … 再研磨の指示書に載せてよい工程（stepAllowedForType）。
 *              コーティング・検査のように製造と両方に入る工程もある
 *
 * 以前の画面は isPrepStep だけで「準備 / 製造」の 2 択を出していたので、
 * 再研磨カテゴリの工程が「製造」と表示されていた。
 */

import {
  type CatalogStep,
  isPrepStep,
  isRegrindStep,
  type ProcessRouteKind,
  stepAllowedForType,
} from "./workflow-core";

export function routeKindsForStep(
  step: Pick<CatalogStep, "category" | "code" | "allowedWorkOrderTypes">,
): ProcessRouteKind[] {
  const kinds: ProcessRouteKind[] = [];
  if (isPrepStep(step)) kinds.push("PREP");
  else if (!isRegrindStep(step)) kinds.push("MANUFACTURING");
  if (!isPrepStep(step) && stepAllowedForType(step, "REGRIND")) {
    kinds.push("REGRIND");
  }
  return kinds;
}

export const ROUTE_KIND_COLOR: Record<ProcessRouteKind, string> = {
  PREP: "teal",
  MANUFACTURING: "indigo",
  REGRIND: "orange",
};

/** 表示ラベルの鍵（messages の master.processSteps.*）。 */
export const ROUTE_KIND_LABEL_KEY: Record<ProcessRouteKind, string> = {
  PREP: "routeKindPrep",
  MANUFACTURING: "routeKindManufacturing",
  REGRIND: "routeKindRegrind",
};
