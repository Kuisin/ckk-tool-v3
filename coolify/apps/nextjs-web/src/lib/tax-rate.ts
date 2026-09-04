/**
 * tax-rate.ts — 消費税率（顧客属性 tax_type → 率）。純ロジック。
 *
 * TAXABLE=10% / REDUCED=8% / EXEMPT=0%。税額 = round(小計 × 税率)。
 * 締日処理（請求書）と見積書の税額計算が**同じ表**を見る — 以前は見積書だけが
 * 10% 固定で、非課税・軽減税率の顧客に出す見積書の税額が請求書と食い違っていた。
 * 未指定（顧客属性なし）は課税扱い。
 */

export const TAX_RATES: Record<string, number> = {
  TAXABLE: 0.1,
  REDUCED: 0.08,
  EXEMPT: 0,
};

export function taxRateFor(taxType: string | null | undefined): number {
  return TAX_RATES[taxType ?? "TAXABLE"] ?? 0.1;
}
