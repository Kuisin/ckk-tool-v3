import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCALE_PRESET,
  parseScalePreset,
  scalePresetRanges,
  scalePresetUnitPrice,
  validateScalePreset,
} from "./price-scale-preset";

describe("DEFAULT_SCALE_PRESET", () => {
  it("is valid and reproduces the old lot-discount table", () => {
    expect(validateScalePreset(DEFAULT_SCALE_PRESET)).toBeNull();
    const at = (q: number) =>
      [...scalePresetRanges(DEFAULT_SCALE_PRESET)]
        .reverse()
        .find((r) => q >= r.minQuantity)?.multiplier;
    expect(at(1)).toBe(1.02);
    expect(at(5)).toBe(1.02);
    expect(at(6)).toBe(1.01);
    expect(at(21)).toBe(1.0);
    expect(at(100)).toBe(0.96);
    expect(at(101)).toBe(0.94);
    expect(at(500)).toBe(0.88);
    expect(at(501)).toBe(0.85);
  });
});

describe("scalePresetRanges", () => {
  it("derives each max from the next row's min, open-ended at the end", () => {
    const r = scalePresetRanges([
      { minQuantity: 1, multiplier: 1 },
      { minQuantity: 10, multiplier: 0.9 },
    ]);
    expect(r.map((x) => [x.minQuantity, x.maxQuantity])).toEqual([
      [1, 9],
      [10, null],
    ]);
  });

  it("sorts by min first", () => {
    const r = scalePresetRanges([
      { minQuantity: 10, multiplier: 0.9 },
      { minQuantity: 1, multiplier: 1 },
    ]);
    expect(r[0].minQuantity).toBe(1);
    expect(r[0].maxQuantity).toBe(9);
  });
});

describe("validateScalePreset", () => {
  it("rejects empty / not starting at 1 / not ascending / bad multiplier", () => {
    expect(validateScalePreset([])?.kind).toBe("empty");
    expect(validateScalePreset([{ minQuantity: 2, multiplier: 1 }])?.kind).toBe(
      "firstNotOne",
    );
    expect(
      validateScalePreset([
        { minQuantity: 1, multiplier: 1 },
        { minQuantity: 1, multiplier: 1 },
      ]),
    ).toEqual({ kind: "notAscending", index: 1 });
    expect(
      validateScalePreset([
        { minQuantity: 1, multiplier: 1 },
        { minQuantity: 5, multiplier: 0 },
      ]),
    ).toEqual({ kind: "badMultiplier", index: 1 });
    expect(
      validateScalePreset([
        { minQuantity: 1, multiplier: 1 },
        { minQuantity: 2.5, multiplier: 1 },
      ]),
    ).toEqual({ kind: "notInteger", index: 1 });
  });
});

describe("scalePresetUnitPrice", () => {
  it("rounds base × multiplier to whole yen", () => {
    expect(scalePresetUnitPrice(1000, 1.02)).toBe(1020);
    expect(scalePresetUnitPrice(333, 0.94)).toBe(313);
  });
});

describe("parseScalePreset", () => {
  it("accepts a valid stored value and rejects malformed ones", () => {
    expect(
      parseScalePreset([{ minQuantity: 1, multiplier: 1 }]),
    ).not.toBeNull();
    expect(parseScalePreset("x")).toBeNull();
    expect(parseScalePreset([{ minQuantity: "1", multiplier: 1 }])).toBeNull();
    expect(parseScalePreset([{ minQuantity: 3, multiplier: 1 }])).toBeNull();
  });
});
