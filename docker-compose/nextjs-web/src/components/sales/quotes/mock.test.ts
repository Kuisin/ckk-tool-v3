/**
 * 見積書 price resolution — quotes are print-only; 単価・値引きとも価格表から
 * 自動解決される (resolveUnitPrice)。All date-sensitive assertions pass
 * explicit dates — never "today" (MOCK_QUOTES totals are date-dependent by
 * design, so tests avoid asserting on them).
 */

import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/format";
import {
  findPriceTierRef,
  priceEntriesForQuote,
  type Quote,
  type QuoteItem,
  quoteTotals,
  resolveUnitPrice,
  tierLabel,
} from "./mock";

const CUSTOMER = "bp-001";
const PRODUCT = "PRD-202601-0001";
const MAY = new Date("2026-05-01"); // no discount rule active
const JULY = new Date("2026-07-01"); // 夏季キャンペーン (5%, 100本〜) active

describe("resolveUnitPrice — 顧客×製品×注文種別×数量×日付 → 単価・値引き", () => {
  it("selects the tier by quantity band (manual override tier)", () => {
    const r = resolveUnitPrice(CUSTOMER, PRODUCT, "PRODUCTION", 5, MAY);
    expect(r).toMatchObject({
      unitPrice: 8000, // ti-1 has priceOverride 8000
      tierId: "ti-1",
      tierLabel: "1〜9本",
      discountAmount: 0,
      discountId: null,
      discountLabel: null,
    });
  });

  it("computes 基準単価 × 倍率 for auto tiers", () => {
    // ti-2: 6000 × 1.15 = 6900
    expect(
      resolveUnitPrice(CUSTOMER, PRODUCT, "PRODUCTION", 15, MAY)?.unitPrice,
    ).toBe(6900);
    // ti-2b: ×1.00 → 6000
    expect(
      resolveUnitPrice(CUSTOMER, PRODUCT, "PRODUCTION", 100, MAY)?.unitPrice,
    ).toBe(6000);
  });

  it("auto-applies the 値引きルール when quantity + date match", () => {
    const r = resolveUnitPrice(CUSTOMER, PRODUCT, "PRODUCTION", 100, JULY);
    expect(r?.unitPrice).toBe(6000);
    // 夏季キャンペーン 5% → 300/本 × 100本
    expect(r?.discountAmount).toBe(30_000);
    expect(r?.discountId).toBe("pd-1");
    expect(r?.discountLabel).toBe("夏季キャンペーン（5%）");
  });

  it("no discount outside the rule period", () => {
    expect(
      resolveUnitPrice(CUSTOMER, PRODUCT, "PRODUCTION", 100, MAY)
        ?.discountAmount,
    ).toBe(0);
  });

  it("returns null when no 価格表 entry exists", () => {
    expect(resolveUnitPrice("bp-unknown", PRODUCT, "PRODUCTION", 1, MAY)).toBe(
      null,
    );
    expect(resolveUnitPrice(CUSTOMER, PRODUCT, "TEST", 1, MAY)).toBe(null);
  });

  it("returns null when quantity is outside every tier", () => {
    // bp-003 TEST entry has a single 1〜10本 tier
    expect(resolveUnitPrice("bp-003", "PRD-202603-0012", "TEST", 11, MAY)).toBe(
      null,
    );
  });

  it("SAMPLE entries resolve to 金額0", () => {
    expect(
      resolveUnitPrice(CUSTOMER, PRODUCT, "SAMPLE", 3, MAY)?.unitPrice,
    ).toBe(0);
  });
});

describe("quoteTotals — 小計 / 消費税10% / 合計", () => {
  const item = (over: Partial<QuoteItem>): QuoteItem => ({
    id: "i",
    productId: "p",
    productName: "p",
    orderType: "PRODUCTION",
    quantity: 1,
    unitPrice: 0,
    priceTierId: null,
    discountAmount: 0,
    discountLabel: null,
    amount: 0,
    deliveryDate: null,
    notes: null,
    ...over,
  });
  const quote = (items: QuoteItem[]): Quote => ({
    id: "q",
    quoteNumber: "QOT-TEST-00001",
    customerId: "c",
    customerName: "c",
    customerBranchId: null,
    customerBranchName: null,
    status: "DRAFT",
    validUntil: null,
    notes: null,
    items,
    pdfFile: null,
    createdBy: "t",
    createdAt: "2026-01-01 00:00",
    updatedAt: "2026-01-01 00:00",
  });

  it("sums line amounts and rounds 10% tax", () => {
    const t = quoteTotals(
      quote([item({ amount: 1000 }), item({ amount: 2000 })]),
    );
    expect(t).toEqual({ subtotal: 3000, tax: 300, grandTotal: 3300 });
  });

  it("tax rounding on odd subtotals", () => {
    const t = quoteTotals(quote([item({ amount: 1005 })]));
    expect(t.tax).toBe(Math.round(1005 * 0.1));
    expect(t.grandTotal).toBe(1005 + t.tax);
  });
});

describe("価格表 back-references", () => {
  it("tierLabel formats quantity bands", () => {
    expect(
      tierLabel({
        id: "t",
        minQuantity: 1,
        maxQuantity: 9,
        multiplier: 1,
        priceOverride: null,
      }),
    ).toBe("1〜9本");
    expect(
      tierLabel({
        id: "t",
        minQuantity: 100,
        maxQuantity: null,
        multiplier: 1,
        priceOverride: null,
      }),
    ).toBe("100本〜");
  });

  it("findPriceTierRef resolves a stored tier id to its entry + label", () => {
    const ref = findPriceTierRef("ti-2");
    expect(ref?.entryId).toBe("bp-001__PRD-202601-0001__PRODUCTION");
    expect(ref?.estimateNumber).toBe("EST-202605-00031");
    expect(ref?.label).toBe(`10〜29本 ${formatMoney(6900)}`);
    expect(findPriceTierRef("nope")).toBe(null);
    expect(findPriceTierRef(null)).toBe(null);
  });

  it("priceEntriesForQuote collects the distinct entries behind a quote", () => {
    const q = {
      items: [
        { priceTierId: "ti-1" },
        { priceTierId: "ti-2" }, // same entry as ti-1
        { priceTierId: "ti-4" }, // bp-002 entry
        { priceTierId: null },
      ],
    } as Quote;
    const entries = priceEntriesForQuote(q);
    expect(entries.map((e) => e.customerId).sort()).toEqual([
      "bp-001",
      "bp-002",
    ]);
  });
});
