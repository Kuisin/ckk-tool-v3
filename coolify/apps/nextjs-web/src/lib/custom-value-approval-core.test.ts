import { describe, expect, it } from "vitest";
import {
  appendCustomValueSteps,
  customValueSignature,
  decideCustomValueApproval,
  isAcceptanceCustomPriceState,
  type PriceVariantCustomInput,
  priceEntryUsable,
  priceListCustomValues,
} from "./custom-value-approval-core";

const variant = (
  over: Partial<PriceVariantCustomInput> = {},
): PriceVariantCustomInput => ({
  orderType: "PRODUCTION",
  isActive: true,
  baseUnitPrice: 1000,
  estimateNumber: "EST-202610-00001",
  estimateBase: 1000,
  tiers: [{ minQuantity: 1, maxQuantity: null, priceOverride: null }],
  ...over,
});

describe("appendCustomValueSteps", () => {
  it("通常の段の後ろに通し番号で足し、独自値の段に印を付ける", () => {
    const out = appendCustomValueSteps(
      [{ stepNo: 1 }, { stepNo: 2 }],
      [{ stepNo: 1 }],
    );
    expect(out.map((s) => s.stepNo)).toEqual([1, 2, 3]);
    expect(out.map((s) => s.layer)).toEqual([
      undefined,
      undefined,
      "customValue",
    ]);
  });

  it("通常の段が無くても独自値の段だけで 1..N になる（価格表）", () => {
    const out = appendCustomValueSteps([], [{ stepNo: 1 }, { stepNo: 2 }]);
    expect(out.map((s) => s.stepNo)).toEqual([1, 2]);
  });

  it("足す段が無ければ通常の段のまま", () => {
    const out = appendCustomValueSteps([{ stepNo: 1 }], []);
    expect(out).toEqual([{ stepNo: 1 }]);
  });
});

describe("isAcceptanceCustomPriceState", () => {
  it("価格表どおりだけが引き継いだ値", () => {
    expect(isAcceptanceCustomPriceState("onList")).toBe(false);
    expect(isAcceptanceCustomPriceState("unresolved")).toBe(false);
    expect(isAcceptanceCustomPriceState("unset")).toBe(false);
    for (const s of ["override", "diff", "noTier", "unpriced"] as const)
      expect(isAcceptanceCustomPriceState(s)).toBe(true);
  });
});

describe("priceListCustomValues", () => {
  it("価格試算どおりの基準単価・倍率だけなら独自値なし", () => {
    expect(priceListCustomValues([variant()])).toEqual([]);
  });

  it("価格試算なしの基準単価は独自値", () => {
    expect(
      priceListCustomValues([
        variant({ estimateNumber: null, estimateBase: null }),
      ]),
    ).toEqual([
      { kind: "manualBase", orderType: "PRODUCTION", baseUnitPrice: 1000 },
    ]);
  });

  it("価格試算と違う基準単価は独自値（円未満 2 桁で比べる）", () => {
    expect(priceListCustomValues([variant({ estimateBase: 999.996 })])).toEqual(
      [],
    );
    expect(priceListCustomValues([variant({ baseUnitPrice: 1100 })])).toEqual([
      {
        kind: "baseDiffersFromEstimate",
        orderType: "PRODUCTION",
        baseUnitPrice: 1100,
        estimateNumber: "EST-202610-00001",
        estimateBase: 1000,
      },
    ]);
  });

  it("段階単価の上書きは独自値", () => {
    const values = priceListCustomValues([
      variant({
        tiers: [
          { minQuantity: 10, maxQuantity: null, priceOverride: 900 },
          { minQuantity: 1, maxQuantity: 9, priceOverride: null },
        ],
      }),
    ]);
    expect(values).toEqual([
      {
        kind: "tierOverride",
        orderType: "PRODUCTION",
        minQuantity: 10,
        maxQuantity: null,
        priceOverride: 900,
      },
    ]);
  });

  it("無効なバリアントは数えない", () => {
    expect(
      priceListCustomValues([
        variant({ isActive: false, estimateNumber: null, estimateBase: null }),
      ]),
    ).toEqual([]);
  });
});

describe("customValueSignature", () => {
  it("独自値が無ければ null", () => {
    expect(customValueSignature([])).toBeNull();
  });

  it("並びが違っても同じ内容なら同じ指紋", () => {
    const a = priceListCustomValues([
      variant({ orderType: "TEST", estimateNumber: null }),
      variant({ orderType: "PRODUCTION", baseUnitPrice: 1200 }),
    ]);
    const b = priceListCustomValues([
      variant({ orderType: "PRODUCTION", baseUnitPrice: 1200 }),
      variant({ orderType: "TEST", estimateNumber: null }),
    ]);
    expect(customValueSignature(a)).toBe(customValueSignature(b));
  });

  it("独自値の金額が変われば指紋も変わる", () => {
    const a = priceListCustomValues([variant({ baseUnitPrice: 1200 })]);
    const b = priceListCustomValues([variant({ baseUnitPrice: 1300 })]);
    expect(customValueSignature(a)).not.toBe(customValueSignature(b));
  });
});

describe("decideCustomValueApproval", () => {
  const base = {
    status: "NONE" as const,
    signature: null,
    nextSignature: "x",
    layerConfigured: true,
  };

  it("独自値が無い・段が無いなら承認不要", () => {
    expect(decideCustomValueApproval({ ...base, nextSignature: null })).toEqual(
      { kind: "clear" },
    );
    expect(
      decideCustomValueApproval({ ...base, layerConfigured: false }),
    ).toEqual({ kind: "clear" });
  });

  it("独自値が変わっていなければ承認済み・依頼中をそのまま使う", () => {
    for (const status of ["APPROVED", "PENDING"] as const)
      expect(
        decideCustomValueApproval({ ...base, status, signature: "x" }),
      ).toEqual({ kind: "keep" });
  });

  it("独自値が変わった・差し戻し済み・未承認なら依頼する", () => {
    expect(
      decideCustomValueApproval({
        ...base,
        status: "APPROVED",
        signature: "y",
      }),
    ).toEqual({ kind: "request" });
    expect(
      decideCustomValueApproval({
        ...base,
        status: "REJECTED",
        signature: "x",
      }),
    ).toEqual({ kind: "request" });
    expect(decideCustomValueApproval(base)).toEqual({ kind: "request" });
  });
});

describe("priceEntryUsable", () => {
  it("承認待ち・差し戻しの価格表は価格の解決に使わない", () => {
    expect(priceEntryUsable("NONE")).toBe(true);
    expect(priceEntryUsable("APPROVED")).toBe(true);
    expect(priceEntryUsable(undefined)).toBe(true);
    expect(priceEntryUsable("PENDING")).toBe(false);
    expect(priceEntryUsable("REJECTED")).toBe(false);
  });
});
