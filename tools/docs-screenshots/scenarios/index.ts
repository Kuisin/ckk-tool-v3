/**
 * index.ts — シナリオの登録簿。並び順 = レポートの並び順（実行は並列）。
 *
 * どれも互いに独立: 1 本ごとにシード直後の DB を複製して使うので、前の 1 本が
 * 作った書類を次の 1 本が見ることはない（scripts/scenarios.ts）。
 *
 * 分野ごとの一覧は group-*.ts。1 本 = 1 ファイル（scenarios/<id>.ts）で書き、
 * その分野の group に足す。
 */

import { walkthroughs } from "../walkthroughs";
import { frameworkSmoke } from "./framework-smoke";
import { companyScenarios } from "./group-company";
import { inventoryScenarios } from "./group-inventory";
import { productionScenarios } from "./group-production";
import { salesScenarios } from "./group-sales";
import type { AnyScenario, Scenario } from "./types";

/**
 * 業務の通し操作（walkthroughs/）を、シナリオとしても走らせる。同じ手順を
 * 手順ごとの画像つきで残すため（walk:check は合否だけ）。
 */
const processFlows: Scenario[] = walkthroughs.map((w) => ({
  id: w.id,
  title: w.title,
  feature: "業務の流れ（回帰）",
  user: w.user,
  steps: w.steps,
}));

export const scenarios: AnyScenario[] = [
  frameworkSmoke,
  ...salesScenarios,
  ...companyScenarios,
  ...productionScenarios,
  ...inventoryScenarios,
  ...processFlows,
];
