/**
 * money.ts — 円の丸め方（唯一の定義）。純ロジック。
 *
 * `unit_price` は numeric(12,2) なので「単価 × 数量」は 1 円未満を持ち得る。
 * ところが丸める場所が揃っていなかった: 締日処理は税額だけを `Math.round` し
 * 合計は丸めず、CSV 書き出し（`lib/csv-export.ts`）は受け取った合計を**もう一度**
 * 丸めていた。結果、同じ請求書でも PDF の合計と弥生 CSV の仕訳が 1 円ずれ得る。
 *
 * **方針（ここが唯一の定義）** — 円未満を持ち回らず、行の段階で 1 回だけ丸める:
 *
 *   1. 行の金額  = round(単価 × 数量)          … 明細に見える金額がそのまま正
 *   2. 小計      = Σ（丸めた行の金額）          … 「小計 ≠ 明細の合計」を作らない
 *   3. 消費税    = round(小計 × 税率)
 *   4. 合計      = 小計 + 消費税                … ここではもう丸めない（両者とも整数）
 *
 * 丸めは **`Math.round`（0.5 は切り上げ）** で統一する。段の途中に端数を残さない
 * ので、どこから読んでも同じ数になる — PDF・画面・CSV が食い違わないのはこの
 * 性質による。以後、円の丸めは必ずこの関数を通すこと（各所で `Math.round` を
 * 書き直さない）。
 */

/** 円未満を丸めて整数円にする（0.5 は切り上げ）。全ての金額丸めの入口。 */
export function roundYen(value: number): number {
  return Math.round(value);
}

/** 明細 1 行の金額 = round(単価 × 数量)。 */
export function lineAmountYen(unitPrice: number, quantity: number): number {
  return roundYen(unitPrice * quantity);
}

/** 小計 = Σ（丸め済みの行金額）。渡す金額は行単位で丸めてあること。 */
export function subtotalYen(lineAmounts: readonly number[]): number {
  return lineAmounts.reduce((sum, a) => sum + roundYen(a), 0);
}

/** 消費税 = round(小計 × 税率)。 */
export function taxAmountYen(subtotal: number, taxRate: number): number {
  return roundYen(subtotal * taxRate);
}

/**
 * 小計・税額・合計をまとめて出す（請求書・見積書の共通形）。
 * 行金額は内部で丸めるので、呼び出し側は生の「単価 × 数量」を渡してよい。
 */
export function totalsYen(
  lineAmounts: readonly number[],
  taxRate: number,
): { subtotal: number; taxAmount: number; totalAmount: number } {
  const subtotal = subtotalYen(lineAmounts);
  const taxAmount = taxAmountYen(subtotal, taxRate);
  return { subtotal, taxAmount, totalAmount: subtotal + taxAmount };
}
