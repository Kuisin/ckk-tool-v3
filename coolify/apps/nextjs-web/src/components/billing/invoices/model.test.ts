import { describe, expect, it } from "vitest";
import {
  formatRatePercent,
  type InvoiceTaxBucket,
  resolveTaxBuckets,
  taxBucketLabel,
} from "./model";

// tr は「鍵と変数をそのまま返す」偽物で足りる（訳文の中身は messages 側の責任）。
const tr = ((key: string, vars?: Record<string, unknown>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key) as never;

const bucket = (
  taxRate: number,
  taxableBase: number,
  taxAmount: number,
): InvoiceTaxBucket => ({
  taxRate,
  taxableBase,
  taxAmount,
  categoryName: null,
});

describe("resolveTaxBuckets", () => {
  it("束があればそのまま使う", () => {
    const buckets = [bucket(0.1, 12_000, 1_200), bucket(0.08, 5_000, 400)];
    expect(
      resolveTaxBuckets({
        subtotal: 17_000,
        taxAmount: 1_600,
        taxRate: null,
        taxBuckets: buckets,
      }),
    ).toEqual(buckets);
  });

  // ★ ここが「移行しても古い請求書の見た目が変わらない」根拠。
  it("束が無い旧請求書はヘッダから 1 本合成する", () => {
    const got = resolveTaxBuckets({
      subtotal: 250_000,
      taxAmount: 25_000,
      taxRate: 0.1,
      taxBuckets: [],
    });
    expect(got).toEqual([
      {
        taxRate: 0.1,
        taxableBase: 250_000,
        taxAmount: 25_000,
        categoryName: null,
      },
    ]);
    // 合成した束は必ずヘッダと一致する（表示が食い違わない条件）。
    expect(got[0].taxableBase).toBe(250_000);
    expect(got[0].taxAmount).toBe(25_000);
  });

  it("税率も無い最古の行は「税額 ÷ 小計」から率を起こす", () => {
    const got = resolveTaxBuckets({
      subtotal: 10_000,
      taxAmount: 800,
      taxRate: null,
      taxBuckets: [],
    });
    expect(got[0].taxRate).toBe(0.08);
  });

  it("保存された税率が先（割り算の端数で有り得ない率にしない）", () => {
    // 1,005 円 × 10% = 100.5 → 101。割り算だと 0.1005 になってしまう。
    const got = resolveTaxBuckets({
      subtotal: 1_005,
      taxAmount: 101,
      taxRate: 0.1,
      taxBuckets: [],
    });
    expect(got[0].taxRate).toBe(0.1);
  });

  it("小計 0 でも 0 除算しない", () => {
    const got = resolveTaxBuckets({
      subtotal: 0,
      taxAmount: 0,
      taxRate: null,
      taxBuckets: [],
    });
    expect(got[0].taxRate).toBe(0);
  });
});

describe("taxBucketLabel", () => {
  it("率から見出しを組み立てる（区分名ではなく）", () => {
    expect(taxBucketLabel(bucket(0.1, 0, 0), tr)).toBe(
      'billing.invoices.taxLabelRate:{"rate":"10"}',
    );
    expect(taxBucketLabel(bucket(0.08, 0, 0), tr)).toBe(
      'billing.invoices.taxLabelRate:{"rate":"8"}',
    );
  });

  it("0% は「非課税」（「消費税（0%）」は帳票の言い回しとして不自然）", () => {
    expect(taxBucketLabel(bucket(0, 0, 0), tr)).toBe(
      "billing.invoices.taxLabelExempt",
    );
  });
});

describe("formatRatePercent", () => {
  it("端数を落とさず、浮動小数の誤差も出さない", () => {
    expect(formatRatePercent(0.1)).toBe("10");
    expect(formatRatePercent(0.08)).toBe("8");
    expect(formatRatePercent(0.0825)).toBe("8.25");
    expect(formatRatePercent(0.07 + 0.01)).toBe("8");
  });
});
