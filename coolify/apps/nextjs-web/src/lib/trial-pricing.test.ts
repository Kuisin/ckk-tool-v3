/**
 * 価格試算 engine — base-price sanity. 価格試算は基準単価を 1 点だけ算出する
 * （= roundUp(最低単価 × 補正値, 10円台)）。数量スケール（何本から何倍か）は
 * 価格表の数量段階（price-scale-preset）が持つので、ここには掛け率も基準数量
 * の入力も無い。形状出しの按分本数だけは SY02 の固定値（shapeOutBaseQuantity）。
 */

import { describe, expect, it } from "vitest";
import { MOCK_TRIAL_ESTIMATES } from "@/components/sales/trial-estimates/fixtures";
import { calcTrialPricing } from "./trial-pricing";
import {
  type CustomInputDef,
  DEFAULT_CRITERIA,
} from "./trial-pricing-criteria";
import { CORRECTION_FACTOR } from "./trial-pricing-data";

/** Excel ROUNDUP(x, -1) — 10円単位切り上げ (mirrors the engine's rounding). */
const roundUpTens = (x: number) => Math.ceil(x / 10) * 10;

const shapeOutBase = (n: number): CustomInputDef[] => [
  {
    key: "shapeOutBaseQuantity",
    label: "形状出し按分本数",
    type: "number",
    default: n,
    order: 5,
    scope: "global",
  },
];

describe("calcTrialPricing — 基準単価（数量スケールなし）", () => {
  it("yields exactly one base price per estimate", () => {
    for (const record of MOCK_TRIAL_ESTIMATES) {
      const result = calcTrialPricing(record.input);
      expect(result.lots).toHaveLength(1);
      expect(result.lots[0].quantity).toBe(100);
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

  it("最低単価 = 内訳 8 項目 + 形状出し（1本按分）", () => {
    for (const record of MOCK_TRIAL_ESTIMATES) {
      const r = calcTrialPricing(record.input);
      const sum =
        Object.values(r.breakdown).reduce((a, b) => a + b, 0) +
        r.lots[0].perPiece;
      expect(r.lots[0].minimumPrice).toBeCloseTo(sum, 6);
    }
  });

  it("形状出し按分本数（固定値）が少ないほど 1 本あたりの按分は大きい", () => {
    const input = MOCK_TRIAL_ESTIMATES[0].input;
    const at100 = calcTrialPricing(input, { customInputs: shapeOutBase(100) });
    const at10 = calcTrialPricing(input, { customInputs: shapeOutBase(10) });
    expect(at10.lots[0].quantity).toBe(10);
    expect(at10.lots[0].minimumPrice).toBeGreaterThan(
      at100.lots[0].minimumPrice,
    );
    expect(at10.lots[0].perPiece).toBeCloseTo(at100.lots[0].perPiece * 10, 6);
  });

  it("旧 final の式（discountRate を掛ける）が保存されていても 0 円にならない", () => {
    const input = MOCK_TRIAL_ESTIMATES[0].input;
    const legacyFinal = {
      id: "final",
      name: "見積単価",
      role: "final" as const,
      order: 999,
      enabled: true,
      expression: "round(subtotal * discountRate * correctionFactor, 10)",
    };
    const std = calcTrialPricing(input);
    const stored = calcTrialPricing(input, {
      criteria: [
        ...DEFAULT_CRITERIA.filter((c) => c.role !== "final"),
        legacyFinal,
      ],
    });
    expect(stored.lots[0].estimateUnitPrice).toBe(
      std.lots[0].estimateUnitPrice,
    );
  });
});
