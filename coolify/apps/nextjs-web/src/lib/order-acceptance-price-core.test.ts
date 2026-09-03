import { describe, expect, it } from "vitest";
import {
  acceptancePriceCounts,
  acceptancePriceState,
  effectiveUnitPrice,
  normalizeOverride,
} from "./order-acceptance-price-core";

const line = (o: Partial<Parameters<typeof acceptancePriceState>[0]> = {}) => ({
  matched: true,
  expected: 1000,
  actual: 1000,
  overridden: false,
  ...o,
});

describe("acceptancePriceState", () => {
  it("製品・顧客が未特定なら照合しない", () => {
    expect(acceptancePriceState(line({ matched: false, actual: 999 }))).toBe(
      "unresolved",
    );
  });

  it("価格表が無い行は自由入力（差異ではない）", () => {
    expect(acceptancePriceState(line({ expected: null, actual: 800 }))).toBe(
      "unpriced",
    );
  });

  it("価格表があって単価未入力は未入力として出す", () => {
    expect(acceptancePriceState(line({ actual: null }))).toBe("unset");
  });

  it("価格表どおりなら onList", () => {
    expect(acceptancePriceState(line())).toBe("onList");
  });

  it("宣言の無い食い違いは差異", () => {
    expect(acceptancePriceState(line({ actual: 1200 }))).toBe("diff");
  });

  it("上書きが入っていれば差異ではなく上書き", () => {
    expect(acceptancePriceState(line({ actual: 1200, overridden: true }))).toBe(
      "override",
    );
  });

  it("上書きは価格表と同額でも上書きのまま（人が持っている）", () => {
    expect(acceptancePriceState(line({ overridden: true }))).toBe("override");
  });

  it("上書きでも単価が無ければ未入力（宣言だけでは値にならない）", () => {
    expect(acceptancePriceState(line({ actual: null, overridden: true }))).toBe(
      "unset",
    );
  });
});

describe("effectiveUnitPrice", () => {
  it("価格表があって上書きが無ければ入力値を無視する", () => {
    expect(
      effectiveUnitPrice({ expected: 1000, entered: 1200, overridden: false }),
    ).toBe(1000);
  });

  it("上書きなら人の値", () => {
    expect(
      effectiveUnitPrice({ expected: 1000, entered: 1200, overridden: true }),
    ).toBe(1200);
  });

  it("価格表が無ければ人の値（未入力は null のまま）", () => {
    expect(
      effectiveUnitPrice({ expected: null, entered: 800, overridden: false }),
    ).toBe(800);
    expect(
      effectiveUnitPrice({ expected: null, entered: null, overridden: false }),
    ).toBeNull();
  });

  it("価格表があり上書きが無い行は、単価未入力でも価格表の単価が入る", () => {
    expect(
      effectiveUnitPrice({ expected: 1000, entered: null, overridden: false }),
    ).toBe(1000);
  });
});

describe("normalizeOverride", () => {
  it("価格表が無い行の上書きは落とす", () => {
    expect(normalizeOverride({ expected: null, overridden: true })).toBe(false);
  });
  it("価格表がある行の上書きは残す", () => {
    expect(normalizeOverride({ expected: 1000, overridden: true })).toBe(true);
  });
});

describe("acceptancePriceCounts", () => {
  it("差異・上書き・価格表なしを別々に数える", () => {
    expect(
      acceptancePriceCounts([
        "diff",
        "diff",
        "override",
        "unpriced",
        "onList",
        "unresolved",
        "unset",
      ]),
    ).toEqual({ diffCount: 2, overrideCount: 1, unpricedCount: 1 });
  });
});
