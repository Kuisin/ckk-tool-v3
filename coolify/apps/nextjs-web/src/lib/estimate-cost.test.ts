import { describe, expect, it } from "vitest";
import { withoutCost, withoutCostFlags } from "./estimate-cost";
import { calcTrialPricing, type TrialInput } from "./trial-pricing";
import { DEFAULT_CRITERIA } from "./trial-pricing-criteria";

const input: TrialInput = {
  toolType: "ROUND_BAR",
  maxDiameter: 12,
  totalLength: 200,
  materialBarPrice: 1500,
  isBlackSkin: false,
  stepLength: 0,
  stepType: "NONE",
  neckLength: 0,
  neckType: "NONE",
  coating: "無",
  lapType: "NONE",
  inspection: "NONE",
  ldEnabled: false,
  ldLocation: "TIP",
  ldOuterDiameter: 0,
  ldBladeLength: 0,
  machiningMinutes: 8,
  machiningRatePer10min: 2000,
  spareShapeCount: 3,
};

describe("estimate-cost", () => {
  it("withoutCost は原価の情報だけを落とし、見積単価は残す", () => {
    const full = calcTrialPricing(input);
    const stripped = withoutCost(full);
    expect("items" in stripped).toBe(false);
    expect("costTotal" in stripped).toBe(false);
    expect(stripped.lots).toEqual(full.lots);
    expect(stripped.breakdown).toEqual(full.breakdown);
  });

  it("withoutCostFlags は印を落としても見積単価を変えない", () => {
    const criteria = DEFAULT_CRITERIA.map((c) => ({ ...c, isCost: false }));
    const stripped = withoutCostFlags(criteria);
    expect(stripped.every((c) => !("isCost" in c))).toBe(true);
    expect(calcTrialPricing(input, { criteria: stripped }).lots).toEqual(
      calcTrialPricing(input, { criteria }).lots,
    );
  });
});
