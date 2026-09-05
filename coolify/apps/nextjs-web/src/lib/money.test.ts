import { describe, expect, it } from "vitest";
import {
  lineAmountYen,
  roundYen,
  subtotalYen,
  taxAmountYen,
  totalsYen,
} from "./money";

describe("roundYen", () => {
  it("0.5 は切り上げる（丸め方を 1 つに固定する）", () => {
    expect(roundYen(100.5)).toBe(101);
    expect(roundYen(100.4)).toBe(100);
    expect(roundYen(100)).toBe(100);
  });

  it("整数はそのまま（二度丸めても同じ = 冪等）", () => {
    expect(roundYen(roundYen(1234.56))).toBe(roundYen(1234.56));
  });
});

describe("lineAmountYen", () => {
  it("単価の小数は行の段階で消える", () => {
    // 12.34 円 × 3 本 = 37.02 → 37 円
    expect(lineAmountYen(12.34, 3)).toBe(37);
  });
});

describe("subtotalYen", () => {
  it("小計は「丸めた行の和」— 和を丸めるのではない", () => {
    // 生の和 = 0.5 × 3 = 1.5。行ごとに丸めれば 1+1+1 = 3
    expect(subtotalYen([0.5, 0.5, 0.5])).toBe(3);
  });

  it("明細が空なら 0", () => {
    expect(subtotalYen([])).toBe(0);
  });
});

describe("taxAmountYen", () => {
  it("税率ごとに小計から算出する", () => {
    expect(taxAmountYen(10_000, 0.1)).toBe(1_000);
    expect(taxAmountYen(10_000, 0.08)).toBe(800);
    expect(taxAmountYen(10_000, 0)).toBe(0);
  });

  it("端数は円へ丸める", () => {
    // 1,005 × 10% = 100.5 → 101
    expect(taxAmountYen(1_005, 0.1)).toBe(101);
  });
});

describe("totalsYen", () => {
  it("合計 = 小計 + 税額。どちらも整数なので再丸めが要らない", () => {
    const t = totalsYen([12.34, 12.34], 0.1);
    // 行 12 円 × 2 = 24 → 税 2.4 → 2 → 合計 26
    expect(t).toEqual({ subtotal: 24, taxAmount: 2, totalAmount: 26 });
    expect(Number.isInteger(t.totalAmount)).toBe(true);
  });

  it("非課税は税額 0 で合計 = 小計", () => {
    const t = totalsYen([1000, 2000], 0);
    expect(t).toEqual({ subtotal: 3000, taxAmount: 0, totalAmount: 3000 });
  });

  it("もう一度丸めても値が動かない（PDF と CSV が食い違わない条件）", () => {
    const t = totalsYen([99.99, 0.01, 250.5], 0.1);
    expect(roundYen(t.totalAmount)).toBe(t.totalAmount);
    expect(roundYen(t.taxAmount)).toBe(t.taxAmount);
    expect(t.subtotal + t.taxAmount).toBe(t.totalAmount);
  });
});
