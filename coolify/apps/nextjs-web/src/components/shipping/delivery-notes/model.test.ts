import { describe, expect, it } from "vitest";
import { deliveryNoteTotals } from "./model";

const line = (amount: number | null, taxRate: number | null) => ({
  amount,
  taxRate,
});

describe("deliveryNoteTotals", () => {
  it("価格記載なしの納品書は null（金額そのものを出さない）", () => {
    expect(
      deliveryNoteTotals({
        includePrice: false,
        customerTaxType: null,
        items: [line(1000, 0.1)],
      }),
    ).toBeNull();
  });

  it("行に凍結された率で数える", () => {
    const t = deliveryNoteTotals({
      includePrice: true,
      customerTaxType: null,
      items: [line(96_600, 0.1), line(92_500, 0.08)],
    });
    expect(t).toEqual({
      subtotal: 189_100,
      taxAmount: 17_060,
      totalAmountInclTax: 206_160,
      buckets: [
        { taxRate: 0.1, taxableBase: 96_600, taxAmount: 9_660 },
        { taxRate: 0.08, taxableBase: 92_500, taxAmount: 7_400 },
      ],
    });
  });

  // ★ 移行の前後で発行済みの納品書が動かないことの根拠。
  it("率を持たない旧データは受取先の課税区分から起こす", () => {
    const reduced = deliveryNoteTotals({
      includePrice: true,
      customerTaxType: "REDUCED",
      items: [line(10_000, null)],
    });
    expect(reduced?.taxAmount).toBe(800);

    const exempt = deliveryNoteTotals({
      includePrice: true,
      customerTaxType: "EXEMPT",
      items: [line(10_000, null)],
    });
    expect(exempt?.taxAmount).toBe(0);

    // 課税区分も無ければ従来どおり 10%
    const fallback = deliveryNoteTotals({
      includePrice: true,
      customerTaxType: null,
      items: [line(10_000, null)],
    });
    expect(fallback?.taxAmount).toBe(1_000);
  });

  it("凍結された率が受取先の課税区分より優先される", () => {
    // 受取先は非課税でも、確定時に 10% で焼いた行は 10% のまま。
    const t = deliveryNoteTotals({
      includePrice: true,
      customerTaxType: "EXEMPT",
      items: [line(10_000, 0.1)],
    });
    expect(t?.taxAmount).toBe(1_000);
  });

  it("金額が null の行は 0 として数える（価格未設定の行）", () => {
    const t = deliveryNoteTotals({
      includePrice: true,
      customerTaxType: null,
      items: [line(null, 0.1), line(1_000, 0.1)],
    });
    expect(t?.subtotal).toBe(1_000);
    expect(t?.taxAmount).toBe(100);
  });

  // 請求書と同じ数え方を通していることの確認 — 納品書に刷った金額と、後で届く
  // 請求書の金額が食い違ってはいけない。
  it("税の丸めは束ごとに 1 回（行ごとではない）", () => {
    const t = deliveryNoteTotals({
      includePrice: true,
      customerTaxType: null,
      items: [line(1_005, 0.1), line(1_005, 0.1), line(1_005, 0.1)],
    });
    expect(t?.taxAmount).toBe(302); // 行ごとに丸めると 303
  });
});
