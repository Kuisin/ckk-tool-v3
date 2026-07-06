/**
 * 価格表 pricing rules — 倍率 tiers + 値引きルール resolution.
 *
 * 単価 = round(基準単価 × 倍率)（行の priceOverride が最優先）。
 * 値引きは数量・期間条件を満たす有効ルールのうち 1本あたり最大のものを採用。
 * All date-sensitive assertions pass explicit dates — never "today".
 */

import { describe, expect, it } from "vitest";
import {
  entryKey,
  entrySummary,
  findApplicableDiscount,
  findEntriesByCustomerProduct,
  getPriceEntry,
  MOCK_PRICE_ENTRIES,
  multiplierLabel,
  type PriceDiscount,
  type PriceListEntry,
  priceRangeLabel,
  quantityRange,
  requiresEndDate,
  siblingOrderTypes,
  tierUnitPrice,
  unitDiscountOf,
  validPeriod,
} from "./mock";

/** Minimal entry factory for isolated rule tests. */
function makeEntry(over: Partial<PriceListEntry> = {}): PriceListEntry {
  return {
    entryId: entryKey("bp-x", 9001, "PRODUCTION"),
    customerId: "bp-x",
    customerName: "テスト顧客",
    productId: "9001",
    productName: "テスト製品",
    orderType: "PRODUCTION",
    currency: "JPY",
    baseUnitPrice: 6000,
    validFrom: "2026-01-01",
    validUntil: null,
    isActive: true,
    tiers: [],
    discounts: [],
    estimateId: null,
    estimateNumber: null,
    createdBy: "t",
    createdAt: "2026-01-01 00:00",
    updatedAt: "2026-01-01 00:00",
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
  const entry = makeEntry();

  it("computes base × multiplier, rounded to yen", () => {
    expect(
      tierUnitPrice(entry, {
        id: "t",
        minQuantity: 1,
        maxQuantity: null,
        multiplier: 1.15,
        priceOverride: null,
      }),
    ).toBe(6900);
    // rounding: 6000 × 1.011 = 6066
    expect(
      tierUnitPrice(entry, {
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
      tierUnitPrice(entry, {
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
      tierUnitPrice(entry, {
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
  // entry1 mock: 夏季キャンペーン RATE5% 100本〜 2026-06-01..08-31 (active),
  //              初回導入割 AMOUNT300 10〜99本 2026-01-01..03-31 (inactive)
  const entry = getPriceEntry(entryKey("bp-001", 1001, "PRODUCTION"));
  if (!entry) throw new Error("mock entry missing");

  it("applies a rule when quantity and date match", () => {
    const d = findApplicableDiscount(entry, 100, 6000, new Date("2026-07-01"));
    expect(d?.id).toBe("pd-1");
  });

  it("period bounds are inclusive", () => {
    expect(
      findApplicableDiscount(entry, 100, 6000, new Date("2026-06-01"))?.id,
    ).toBe("pd-1");
    expect(
      findApplicableDiscount(entry, 100, 6000, new Date("2026-08-31"))?.id,
    ).toBe("pd-1");
    expect(
      findApplicableDiscount(entry, 100, 6000, new Date("2026-09-01")),
    ).toBeNull();
  });

  it("quantity below the rule's minimum does not match", () => {
    expect(
      findApplicableDiscount(entry, 99, 6300, new Date("2026-07-01")),
    ).toBeNull();
  });

  it("inactive rules are never applied", () => {
    // 初回導入割 would match (qty 10-99, 2026-02-01) but is isActive: false
    expect(
      findApplicableDiscount(entry, 50, 6300, new Date("2026-02-01")),
    ).toBeNull();
  });

  it("picks the largest per-unit discount when several match", () => {
    const e = makeEntry({
      discounts: [
        rule({ id: "small", discountType: "RATE", value: 5 }), // 6000→300
        rule({ id: "big", discountType: "AMOUNT", value: 400 }),
      ],
    });
    expect(
      findApplicableDiscount(e, 10, 6000, new Date("2026-05-01"))?.id,
    ).toBe("big");
  });

  it("returns null when the entry has no rules", () => {
    expect(
      findApplicableDiscount(makeEntry(), 10, 6000, new Date("2026-05-01")),
    ).toBeNull();
  });
});

describe("entry summary & labels", () => {
  it("entrySummary derives min/max from effective tier prices", () => {
    const entry = getPriceEntry(entryKey("bp-001", 1001, "PRODUCTION"));
    if (!entry) throw new Error("mock entry missing");
    // tiers: override 8000 / ×1.15→6900 / ×1.05→6300 / ×1.00→6000
    expect(entrySummary(entry)).toEqual({
      tierCount: 4,
      minPrice: 6000,
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

  it("siblingOrderTypes / findEntriesByCustomerProduct", () => {
    const entry = getPriceEntry(entryKey("bp-001", 1001, "PRODUCTION"));
    if (!entry) throw new Error("mock entry missing");
    expect(siblingOrderTypes(entry)).toEqual(["SAMPLE"]);
    expect(findEntriesByCustomerProduct("bp-001", "1001")).toHaveLength(2);
    expect(findEntriesByCustomerProduct(null, "1001")).toEqual([]);
  });

  it("every mock entry has at least one tier", () => {
    for (const e of MOCK_PRICE_ENTRIES) {
      expect(e.tiers.length).toBeGreaterThan(0);
    }
  });
});
