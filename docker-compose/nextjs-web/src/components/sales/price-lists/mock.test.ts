/**
 * 価格表 pricing rules — 倍率 tiers + 値引きルール resolution.
 *
 * Entry = 顧客×製品、注文種別ごとの価格は entry.variants。
 * 単価 = round(基準単価 × 倍率)（行の priceOverride が最優先）。
 * 値引きは数量・期間条件を満たす有効ルールのうち 1本あたり最大のものを採用。
 * All date-sensitive assertions pass explicit dates — never "today".
 */

import { describe, expect, it } from "vitest";
import {
  entrySummary,
  findApplicableDiscount,
  findEntryByCustomerProduct,
  findVariant,
  getPriceEntry,
  MOCK_PRICE_ENTRIES,
  multiplierLabel,
  type PriceDiscount,
  type PriceVariant,
  priceRangeLabel,
  quantityRange,
  requiresEndDate,
  tierUnitPrice,
  unitDiscountOf,
  validPeriod,
  variantSummary,
} from "./mock";

/** Minimal variant plant for isolated rule tests. */
function makeVariant(over: Partial<PriceVariant> = {}): PriceVariant {
  return {
    id: "va-x",
    orderType: "PRODUCTION",
    baseUnitPrice: 6000,
    validFrom: "2026-01-01",
    validUntil: null,
    isActive: true,
    tiers: [],
    discounts: [],
    estimateId: null,
    estimateNumber: null,
    ...over,
  };
}

const rule = (over: Partial<PriceDiscount> = {}): PriceDiscount => ({
  id: "d1",
  label: "テスト割",
  discountType: "AMOUNT",
  value: 100,
  minQuantity: 1,
  maxQuantity: null,
  validFrom: "2026-01-01",
  validUntil: null,
  isActive: true,
  ...over,
});

describe("tierUnitPrice — 単価 = 基準単価 × 倍率 / 手動上書き", () => {
  const variant = makeVariant();

  it("computes base × multiplier, rounded to yen", () => {
    expect(
      tierUnitPrice(variant, {
        id: "t",
        minQuantity: 1,
        maxQuantity: null,
        multiplier: 1.15,
        priceOverride: null,
      }),
    ).toBe(6900);
    // rounding: 6000 × 1.011 = 6066
    expect(
      tierUnitPrice(variant, {
        id: "t",
        minQuantity: 1,
        maxQuantity: null,
        multiplier: 1.011,
        priceOverride: null,
      }),
    ).toBe(6066);
  });

  it("×1.00 keeps the base price", () => {
    expect(
      tierUnitPrice(variant, {
        id: "t",
        minQuantity: 1,
        maxQuantity: null,
        multiplier: 1,
        priceOverride: null,
      }),
    ).toBe(6000);
  });

  it("manual priceOverride always wins", () => {
    expect(
      tierUnitPrice(variant, {
        id: "t",
        minQuantity: 1,
        maxQuantity: null,
        multiplier: 1.35,
        priceOverride: 8000,
      }),
    ).toBe(8000);
  });
});

describe("unitDiscountOf — 率(%) / 金額(¥/本)", () => {
  it("RATE is a % of the unit price, rounded", () => {
    expect(unitDiscountOf(rule({ discountType: "RATE", value: 5 }), 6000)).toBe(
      300,
    );
    // 3% of 1234 = 37.02 → 37
    expect(unitDiscountOf(rule({ discountType: "RATE", value: 3 }), 1234)).toBe(
      37,
    );
  });

  it("AMOUNT is a fixed per-unit yen value", () => {
    expect(
      unitDiscountOf(rule({ discountType: "AMOUNT", value: 100 }), 6000),
    ).toBe(100);
  });
});

describe("findApplicableDiscount — 数量・期間・有効の判定", () => {
  // entry1 PRODUCTION variant: 夏季キャンペーン RATE5% 100本〜 06-01..08-31
  // (active), 初回導入割 AMOUNT300 10〜99本 01-01..03-31 (inactive)
  const entry = getPriceEntry("PRC-202601-00001");
  const variant = findVariant(entry, "PRODUCTION");
  if (!variant) throw new Error("mock variant missing");

  it("applies a rule when quantity and date match", () => {
    const d = findApplicableDiscount(
      variant,
      100,
      6000,
      new Date("2026-07-01"),
    );
    expect(d?.id).toBe("pd-1");
  });

  it("period bounds are inclusive", () => {
    expect(
      findApplicableDiscount(variant, 100, 6000, new Date("2026-06-01"))?.id,
    ).toBe("pd-1");
    expect(
      findApplicableDiscount(variant, 100, 6000, new Date("2026-08-31"))?.id,
    ).toBe("pd-1");
    expect(
      findApplicableDiscount(variant, 100, 6000, new Date("2026-09-01")),
    ).toBeNull();
  });

  it("quantity below the rule's minimum does not match", () => {
    expect(
      findApplicableDiscount(variant, 99, 6300, new Date("2026-07-01")),
    ).toBeNull();
  });

  it("inactive rules are never applied", () => {
    // 初回導入割 would match (qty 10-99, 2026-02-01) but is isActive: false
    expect(
      findApplicableDiscount(variant, 50, 6300, new Date("2026-02-01")),
    ).toBeNull();
  });

  it("picks the largest per-unit discount when several match", () => {
    const v = makeVariant({
      discounts: [
        rule({ id: "small", discountType: "RATE", value: 5 }), // 6000→300
        rule({ id: "big", discountType: "AMOUNT", value: 400 }),
      ],
    });
    expect(
      findApplicableDiscount(v, 10, 6000, new Date("2026-05-01"))?.id,
    ).toBe("big");
  });

  it("returns null when the variant has no rules", () => {
    expect(
      findApplicableDiscount(makeVariant(), 10, 6000, new Date("2026-05-01")),
    ).toBeNull();
  });
});

describe("entry summary & labels", () => {
  it("variantSummary derives min/max from effective tier prices", () => {
    const entry = getPriceEntry("PRC-202601-00001");
    const variant = findVariant(entry, "PRODUCTION");
    if (!variant) throw new Error("mock variant missing");
    // tiers: override 8000 / ×1.15→6900 / ×1.05→6300 / ×1.00→6000
    expect(variantSummary(variant)).toEqual({
      tierCount: 4,
      minPrice: 6000,
      maxPrice: 8000,
    });
  });

  it("entrySummary aggregates across ALL variants", () => {
    const entry = getPriceEntry("PRC-202601-00001");
    if (!entry) throw new Error("mock entry missing");
    // PRODUCTION (4 tiers, 6000..8000) + SAMPLE (1 tier, ¥0)
    expect(entrySummary(entry)).toEqual({
      variantCount: 2,
      tierCount: 5,
      minPrice: 0,
      maxPrice: 8000,
    });
  });

  it("multiplierLabel / quantityRange / priceRangeLabel / validPeriod", () => {
    expect(
      multiplierLabel({
        id: "t",
        minQuantity: 1,
        maxQuantity: null,
        multiplier: 1.05,
        priceOverride: null,
      }),
    ).toBe("×1.05");
    expect(quantityRange(1, 9)).toBe("1〜9本");
    expect(quantityRange(100, null)).toBe("100本〜");
    // single value when min === max, range with 〜 otherwise
    expect(priceRangeLabel(5000, 5000)).not.toContain("〜");
    expect(priceRangeLabel(5000, 8000)).toContain("〜");
    expect(validPeriod("2026-01-01", null)).toContain("無期限");
  });

  it("requiresEndDate — テスト・サンプルのみ終了日必須", () => {
    expect(requiresEndDate("TEST")).toBe(true);
    expect(requiresEndDate("SAMPLE")).toBe(true);
    expect(requiresEndDate("PRODUCTION")).toBe(false);
    expect(requiresEndDate("OTHER")).toBe(false);
  });

  it("findEntryByCustomerProduct / findVariant — 顧客×製品で1エントリ", () => {
    const entry = findEntryByCustomerProduct(
      "bp-001",
      "1001",
      MOCK_PRICE_ENTRIES,
    );
    expect(entry?.entryId).toBe("PRC-202601-00001");
    expect(entry?.variants.map((v) => v.orderType)).toEqual([
      "PRODUCTION",
      "SAMPLE",
    ]);
    expect(findVariant(entry, "SAMPLE")?.baseUnitPrice).toBe(0);
    // 未登録の注文種別 / 未登録の顧客×製品 は null
    expect(findVariant(entry, "TEST")).toBeNull();
    expect(
      findEntryByCustomerProduct(null, "1001", MOCK_PRICE_ENTRIES),
    ).toBeNull();
    expect(
      findEntryByCustomerProduct("bp-001", "9999", MOCK_PRICE_ENTRIES),
    ).toBeNull();
  });

  it("every mock entry has at least one variant with tiers", () => {
    for (const e of MOCK_PRICE_ENTRIES) {
      expect(e.variants.length).toBeGreaterThan(0);
      for (const v of e.variants) {
        expect(v.tiers.length).toBeGreaterThan(0);
      }
    }
  });
});
