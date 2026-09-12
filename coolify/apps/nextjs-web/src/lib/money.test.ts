import { describe, expect, it } from "vitest";
import {
  lineAmountYen,
  roundYen,
  subtotalYen,
  type TaxLineInput,
  taxAmountYen,
  totalsByRateYen,
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

// ── 税率が混ざる書類（適格請求書の区分記載）──────────────────────────────────

describe("totalsByRateYen", () => {
  // ★ これが「既存の請求額が動かない」ことの根拠。totalsYen は内部でこちらへ
  //   委譲しているので、単一税率の結果が 1 円でもずれたら全請求書がずれる。
  it("単一税率なら totalsYen と完全に一致する", () => {
    const cases: Array<[number[], number]> = [
      [[12.34, 12.34], 0.1],
      [[1000, 2000], 0],
      [[99.99, 0.01, 250.5], 0.1],
      [[1005, 1005, 1005], 0.1],
      [[0.5, 0.5, 0.5], 0.08],
      [[], 0.1],
      [[7], 0.08],
      [[0, 0, 0], 0.1],
    ];
    for (const [amounts, rate] of cases) {
      const mixed = totalsByRateYen(
        amounts.map((amount) => ({ amount, taxRate: rate })),
      );
      const single = totalsYen(amounts, rate);
      expect({
        subtotal: mixed.subtotal,
        taxAmount: mixed.taxAmount,
        totalAmount: mixed.totalAmount,
      }).toEqual(single);
    }
  });

  it("10% と 8% が混ざると束が 2 つ、率の降順で並ぶ", () => {
    const lines: TaxLineInput[] = [
      { amount: 10_000, taxRate: 0.1 },
      { amount: 5_000, taxRate: 0.08 },
      { amount: 2_000, taxRate: 0.1 },
    ];
    const t = totalsByRateYen(lines);
    expect(t.buckets).toEqual([
      { taxRate: 0.1, taxableBase: 12_000, taxAmount: 1_200 },
      { taxRate: 0.08, taxableBase: 5_000, taxAmount: 400 },
    ]);
    expect(t.subtotal).toBe(17_000);
    expect(t.taxAmount).toBe(1_600);
    expect(t.totalAmount).toBe(18_600);
  });

  it("小計は束の対象額の和 = 全行の小計（どちらから数えても同じ）", () => {
    const lines: TaxLineInput[] = [
      { amount: 333.3, taxRate: 0.1 },
      { amount: 666.6, taxRate: 0.08 },
      { amount: 10.5, taxRate: 0 },
    ];
    const t = totalsByRateYen(lines);
    expect(t.subtotal).toBe(subtotalYen(lines.map((l) => l.amount)));
    expect(t.buckets.reduce((s, b) => s + b.taxableBase, 0)).toBe(t.subtotal);
    expect(t.buckets.reduce((s, b) => s + b.taxAmount, 0)).toBe(t.taxAmount);
    expect(t.subtotal + t.taxAmount).toBe(t.totalAmount);
  });

  it("税は束ごとに 1 回だけ丸める（行ごとに丸めない）", () => {
    // 1001 × 10% = 100.1、1002 × 8% = 80.16 → 束ごとなら 100 と 80。
    // 全体を一括で丸めると 2003 × 10% = 200 になってしまう。
    const t = totalsByRateYen([
      { amount: 1001, taxRate: 0.1 },
      { amount: 1002, taxRate: 0.08 },
    ]);
    expect(t.buckets.map((b) => b.taxAmount)).toEqual([100, 80]);
    expect(t.taxAmount).toBe(180);
  });

  it("0% の束は落とさない（区分記載に要る）", () => {
    const t = totalsByRateYen([
      { amount: 1_000, taxRate: 0.1 },
      { amount: 500, taxRate: 0 },
    ]);
    expect(t.buckets).toHaveLength(2);
    expect(t.buckets[1]).toEqual({
      taxRate: 0,
      taxableBase: 500,
      taxAmount: 0,
    });
  });

  it("浮動小数の誤差で同じ率が 2 束に割れない", () => {
    // 0.08 の表現ゆれ（0.1 - 0.02 は 0.08000000000000002）でも 1 束。
    const t = totalsByRateYen([
      { amount: 1_000, taxRate: 0.08 },
      { amount: 1_000, taxRate: 0.1 - 0.02 },
    ]);
    expect(t.buckets).toHaveLength(1);
    expect(t.buckets[0]).toEqual({
      taxRate: 0.08,
      taxableBase: 2_000,
      taxAmount: 160,
    });
  });

  it("明細が空なら束も空で、合計は 0", () => {
    expect(totalsByRateYen([])).toEqual({
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 0,
      buckets: [],
    });
  });
});
