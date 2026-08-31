/**
 * Flow integration — 価格試算 → 価格表 → 見積書.
 *
 * 1. 価格試算 produces ONE base 見積単価 (quantity scale removed).
 * 2. 価格表 is created per 顧客×製品; the 価格試算 is picked as the base-price
 *    source for a 注文種別 variant (manual bypass is explicit), tiers scale it
 *    by ×倍率, 値引きルール are a dedicated per-variant list.
 * 3. 見積書 is print-only: 単価・値引き resolve automatically from the 価格表
 *    (entry by 顧客×製品 → variant by 注文種別 → tier by 数量).
 */

import { describe, expect, it } from "vitest";
import {
  findApplicableDiscount,
  type PriceListEntry,
  type PriceVariant,
  tierUnitPrice,
  unitDiscountOf,
} from "@/components/sales/price-lists/mock";
import { resolveUnitPrice } from "@/components/sales/quotes/mock";
import { getTrialEstimate } from "@/components/sales/trial-estimates/fixtures";
import { calcTrialPricing } from "@/lib/trial-pricing";

describe("価格試算 → 価格表 → 見積書 (constructed entry)", () => {
  // ── 1. 価格試算: base 見積単価 ────────────────────────────────────────────────
  const estimate = getTrialEstimate("te-0002");
  if (!estimate) throw new Error("te-0002 missing");
  const basePrice = calcTrialPricing(estimate.input).lots[0].estimateUnitPrice;

  // ── 2. 価格表を作成 (顧客×製品、価格試算をバリアントの基準単価ソースに選択) ──
  const variant: PriceVariant = {
    id: "fv-1",
    orderType: "PRODUCTION",
    baseUnitPrice: basePrice, // 価格試算値をそのまま使用（バイパスなし）
    validFrom: "2026-04-01",
    validUntil: null,
    isActive: true,
    tiers: [
      {
        id: "ft-1",
        minQuantity: 1,
        maxQuantity: 49,
        multiplier: 1.1,
        priceOverride: null,
      },
      {
        id: "ft-2",
        minQuantity: 50,
        maxQuantity: null,
        multiplier: 1,
        priceOverride: null,
      },
    ],
    discounts: [
      {
        id: "fd-1",
        label: "大口割",
        discountType: "RATE",
        value: 3,
        minQuantity: 100,
        maxQuantity: null,
        validFrom: "2026-06-01",
        validUntil: "2026-06-30",
        isActive: true,
      },
    ],
    estimateId: estimate.id,
    estimateNumber: estimate.estimateNumber,
  };
  const entry: PriceListEntry = {
    entryId: "PRC-202607-00098",
    customerId: "bp-002",
    customerName: "合同会社XYZ工業",
    productId: "9002",
    productName: "テスト製品",
    currency: "JPY",
    isActive: true,
    variants: [variant],
    salesRepId: null,
    salesRepName: null,
    createdBy: "t",
    createdAt: "2026-04-01 00:00",
    updatedAt: "2026-04-01 00:00",
  };

  it("基準単価 equals the 価格試算 value when not bypassed", () => {
    expect(variant.baseUnitPrice).toBe(basePrice);
    expect(basePrice).toBeGreaterThan(0);
    expect(entry.variants[0].estimateNumber).toBe(estimate.estimateNumber);
  });

  it("tier prices scale the 価格試算-derived base by ×倍率", () => {
    expect(tierUnitPrice(variant, variant.tiers[0])).toBe(
      Math.round(basePrice * 1.1),
    );
    expect(tierUnitPrice(variant, variant.tiers[1])).toBe(basePrice);
  });

  it("見積 line = 単価 × 数量 − 自動値引き (rule window active)", () => {
    const qty = 120;
    const tier = variant.tiers[1];
    const unit = tierUnitPrice(variant, tier);
    const d = findApplicableDiscount(
      variant,
      qty,
      unit,
      new Date("2026-06-15"),
    );
    expect(d?.id).toBe("fd-1");
    if (!d) throw new Error("expected discount");
    const discountAmount = unitDiscountOf(d, unit) * qty;
    const amount = Math.max(0, unit * qty - discountAmount);
    expect(discountAmount).toBe(Math.round(unit * 0.03) * qty);
    expect(amount).toBe(unit * qty - discountAmount);
  });

  it("same line outside the rule window has no discount", () => {
    const d = findApplicableDiscount(
      variant,
      120,
      tierUnitPrice(variant, variant.tiers[1]),
      new Date("2026-07-15"),
    );
    expect(d).toBeNull();
  });
});

describe("価格試算 → 価格表 → 見積書 (registered mock data end-to-end)", () => {
  it("bp-002 の登録済み価格表で見積明細が自動計算される", () => {
    // entry (bp-002 × 2008) PRODUCTION variant: base 6200 ×1.00 +
    // 数量増値引き ¥100/本 (50本〜, 2026-04-01..09-30)
    const r = resolveUnitPrice(
      "bp-002",
      "2008",
      "PRODUCTION",
      80,
      new Date("2026-05-20"),
    );
    expect(r?.unitPrice).toBe(6200);
    expect(r?.discountAmount).toBe(100 * 80);
    expect(r?.discountLabel).toContain("数量増値引き");
    // 金額 = 単価 × 数量 − 値引き
    if (!r) throw new Error("expected resolution");
    expect(Math.max(0, r.unitPrice * 80 - r.discountAmount)).toBe(488_000);
  });

  it("エントリ内の注文種別バリアントで解決が分かれる", () => {
    // bp-001 × 1001 は 1 エントリに PRODUCTION と SAMPLE のバリアントを持つ。
    const prod = resolveUnitPrice(
      "bp-001",
      "1001",
      "PRODUCTION",
      100,
      new Date("2026-05-01"),
    );
    expect(prod?.unitPrice).toBe(6000);
    expect(prod?.tierId).toBe("ti-2b");
    const sample = resolveUnitPrice(
      "bp-001",
      "1001",
      "SAMPLE",
      5,
      new Date("2026-05-01"),
    );
    expect(sample?.unitPrice).toBe(0);
    // 未登録の注文種別は解決できない（バリアントなし → null）。
    expect(
      resolveUnitPrice("bp-001", "1001", "TEST", 10, new Date("2026-05-01")),
    ).toBeNull();
  });

  it("価格試算元 EST-202605-00031 → 価格表 (bp-001) → 見積単価チェーンが繋がる", () => {
    const estimate = getTrialEstimate("te-0001");
    expect(estimate?.status).toBe("REGISTERED");
    const r = resolveUnitPrice(
      "bp-001",
      "1001",
      "PRODUCTION",
      100,
      new Date("2026-05-01"),
    );
    // 価格表 variant carries the 価格試算元 link and prices the quote line
    expect(r?.unitPrice).toBe(6000);
    expect(r?.tierId).toBe("ti-2b");
  });
});
