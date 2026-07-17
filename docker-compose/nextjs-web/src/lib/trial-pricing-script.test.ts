import { describe, expect, it } from "vitest";
import type { TrialInput, TrialResult } from "./trial-pricing";
import { applyCustomScript, runCustomScript } from "./trial-pricing-script";

const input = {
  toolType: "ROUND_BAR",
  maxDiameter: 10,
  totalLength: 100,
  machiningMinutes: 5,
} as unknown as TrialInput;

function makeResult(): TrialResult {
  return {
    breakdown: {
      material: 100,
      step: 0,
      neck: 0,
      machining: 50,
      coating: 0,
      lap: 0,
      ld: 0,
      inspection: 0,
    },
    shapeOutPrice: 450,
    lots: [
      {
        lotIndex: 0,
        quantity: 10,
        perPiece: 45,
        minimumPrice: 195,
        autoRate: 1.5,
        discountRate: 1.5,
        estimateUnitPrice: 370,
      },
      {
        lotIndex: 1,
        quantity: 100,
        perPiece: 4.5,
        minimumPrice: 154.5,
        autoRate: 1.3,
        discountRate: 1.3,
        estimateUnitPrice: 250,
      },
    ],
    warnings: [],
  };
}

describe("applyCustomScript", () => {
  it("empty/whitespace script leaves the result unchanged", () => {
    const base = makeResult();
    expect(applyCustomScript("", { input, result: base }).result).toEqual(base);
    expect(applyCustomScript("   \n ", { input, result: base }).result).toEqual(
      base,
    );
    expect(applyCustomScript(null, { input, result: base }).result).toEqual(
      base,
    );
  });

  it("overrides per-lot 見積単価 via unitPrices", () => {
    const script =
      "return { unitPrices: ctx.lots.map(l => l.estimateUnitPrice * 2) };";
    const { result, error } = applyCustomScript(script, {
      input,
      result: makeResult(),
    });
    expect(error).toBeUndefined();
    expect(result.lots[0].estimateUnitPrice).toBe(740);
    expect(result.lots[1].estimateUnitPrice).toBe(500);
  });

  it("clamps invalid overrides (negative / NaN / non-number keep base)", () => {
    const script = "return { unitPrices: [-5, Number.NaN] };";
    const { result } = applyCustomScript(script, {
      input,
      result: makeResult(),
    });
    // both invalid → both lots keep their base price
    expect(result.lots[0].estimateUnitPrice).toBe(370);
    expect(result.lots[1].estimateUnitPrice).toBe(250);
  });

  it("appends warnings", () => {
    const script = "return { warnings: ['要確認: 大口割引', 123] };";
    const { result } = applyCustomScript(script, {
      input,
      result: makeResult(),
    });
    expect(result.warnings).toEqual(["要確認: 大口割引"]);
  });

  it("uses the round() helper", () => {
    const script = "return { unitPrices: [ctx.round(361, 100)] };";
    const { result } = applyCustomScript(script, {
      input,
      result: makeResult(),
    });
    expect(result.lots[0].estimateUnitPrice).toBe(400);
  });

  it("a throwing script yields the base result plus a warning (never throws)", () => {
    const script = "throw new Error('boom');";
    const { result, error } = applyCustomScript(script, {
      input,
      result: makeResult(),
    });
    expect(error).toBe("boom");
    expect(result.lots[0].estimateUnitPrice).toBe(370);
    expect(result.warnings[0]).toContain("カスタム計算エラー");
  });

  it("cannot see host globals (shadowed to undefined)", () => {
    const script =
      "return { warnings: [typeof process, typeof globalThis, typeof fetch] };";
    const { result } = applyCustomScript(script, {
      input,
      result: makeResult(),
    });
    expect(result.warnings).toEqual(["undefined", "undefined", "undefined"]);
  });

  it("context is frozen — mutating it does not affect the returned result", () => {
    const script = "ctx.lots[0].estimateUnitPrice = 9999; return;";
    const { result } = applyCustomScript(script, {
      input,
      result: makeResult(),
    });
    expect(result.lots[0].estimateUnitPrice).toBe(370);
  });

  it("runCustomScript surfaces the raw return value (for the test button)", () => {
    expect(
      runCustomScript("return 1 + 2;", { input, result: makeResult() }),
    ).toBe(3);
  });
});
