/**
 * 試算 engine — base-price sanity. The quantity scale (lot 掛け率) was removed
 * from 試算: with lotMarkups [1] the engine yields ONE base 見積単価
 * (= roundUp(最低単価 × 補正値, 10円台) at the 基準数量). Quantity scaling now
 * lives in the 価格表 (×倍率 tiers).
 */

import { describe, expect, it } from "vitest";
import { MOCK_TRIAL_ESTIMATES } from "@/components/sales/trial-estimates/mock";
import { calcTrialPricing } from "./trial-pricing";
import { CORRECTION_FACTOR } from "./trial-pricing-data";

/** Excel ROUNDUP(x, -1) — 10円単位切り上げ (mirrors the engine's rounding). */
const roundUpTens = (x: number) => Math.ceil(x / 10) * 10;

describe("calcTrialPricing — 基準単価（数量スケールなし）", () => {
  it("lotMarkups [1] neutralizes the lot 掛け率", () => {
    for (const record of MOCK_TRIAL_ESTIMATES) {
      const result = calcTrialPricing(record.input);
      expect(result.lots).toHaveLength(1); // single 基準数量
      expect(result.lots[0].discountRate).toBe(1);
    }
  });

  it("見積単価 = roundUp(最低単価 × 補正値, 10円)", () => {
    const result = calcTrialPricing(MOCK_TRIAL_ESTIMATES[0].input);
    const lot = result.lots[0];
    expect(lot.estimateUnitPrice).toBe(
      roundUpTens(lot.minimumPrice * CORRECTION_FACTOR),
    );
    expect(lot.estimateUnitPrice).toBeGreaterThan(0);
  });

  it("材料原価 (丸棒) = roundUp(参照単価 × 全長/1000, 1円)", () => {
    // te-0001: 5660 ¥/1000mm × 38mm = 215.08 → 216 (黒皮なし)
    const result = calcTrialPricing(MOCK_TRIAL_ESTIMATES[0].input);
    expect(result.breakdown.material).toBe(216);
  });

  it("基準数量 amortizes 形状出し (setup share per piece)", () => {
    const input = MOCK_TRIAL_ESTIMATES[0].input;
    const at100 = calcTrialPricing({ ...input, lotQuantities: [100, 0, 0] });
    const at10 = calcTrialPricing({ ...input, lotQuantities: [10, 0, 0] });
    // smaller 基準数量 → larger per-piece setup share → higher 最低単価
    expect(at10.lots[0].minimumPrice).toBeGreaterThan(
      at100.lots[0].minimumPrice,
    );
    expect(at10.lots[0].perPiece).toBeCloseTo(at100.lots[0].perPiece * 10, 6);
  });
});
