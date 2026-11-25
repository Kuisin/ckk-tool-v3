import { costEstimate } from "./cost-estimate";
import { costOnlyCriterion } from "./cost-only-criterion";
import { markingNumber } from "./marking-number";
import { priceListRegrindTool } from "./price-list-regrind-tool";
import { quoteDiscountNotes } from "./quote-discount-notes";
import type { AnyScenario, ScriptScenario } from "./types";

/** 既存の e2e（#988 のときに書いたもの）をそのまま 1 本として走らせる。 */
const priceListCompany: ScriptScenario = {
  kind: "script",
  id: "price-list-company",
  title: "価格表を法人ごとに持つ — 他社の価格表のコピー・差分・同期",
  feature: "価格表: 対象工具 + 法人ごと (#975, #988)",
  script: "e2e-price-list-company.ts",
};

export const salesScenarios: AnyScenario[] = [
  quoteDiscountNotes,
  markingNumber,
  costEstimate,
  costOnlyCriterion,
  priceListCompany,
  priceListRegrindTool,
];
