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
 *
 * 書類全体が 1 つの税率のときの形。税率が混ざる書類は `totalsByRateYen` を使う
 * （こちらは内部でそちらへ委譲しているので、丸めの経路は物理的に 1 本）。
 */
export function totalsYen(
  lineAmounts: readonly number[],
  taxRate: number,
): { subtotal: number; taxAmount: number; totalAmount: number } {
  const { subtotal, taxAmount, totalAmount } = totalsByRateYen(
    lineAmounts.map((amount) => ({ amount, taxRate })),
  );
  return { subtotal, taxAmount, totalAmount };
}

// ── 税率が混ざる書類（適格請求書の区分記載）──────────────────────────────────
//
// 製品ごとに課税区分を持てるようになったので、1 通の請求書に 8% と 10% が同居する。
// 適格請求書は**税率ごとの区分記載**（対象額と税額を率ごとに書く）を要求するので、
// 合計は「率ごとの束」に分けて数える。

/** 束に入れる 1 行 — 丸める前の金額と、その行に当たった税率。 */
export interface TaxLineInput {
  amount: number;
  taxRate: number;
}

/** 税率 1 つ分の区分記載。`taxableBase` はその率の対象となる税抜金額。 */
export interface TaxBucket {
  taxRate: number;
  taxableBase: number;
  taxAmount: number;
}

export interface TotalsByRate {
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  /** 率の降順（10% → 8% → 0%）。**0% の束も落とさない** — 区分記載に要る。 */
  buckets: TaxBucket[];
}

/**
 * 束ねる鍵。`Decimal(5,4)` と同じ粒度に丸めてから文字列にする —
 * 生の number をキーにすると浮動小数の誤差（0.08 と 0.08000000000000002）で
 * 同じ 8% が 2 束に割れ、区分記載が 2 行になる。
 */
function bucketKey(taxRate: number): string {
  return taxRate.toFixed(4);
}

/**
 * 率ごとの小計・税額と、書類全体の合計。
 *
 * 丸めの規則は money.ts の方針そのままで、混在しても端数を持ち回らない:
 *
 *   1. 行の金額  = round(単価 × 数量)        … 行が唯一の丸め点（従来どおり）
 *   2. 対象額(率) = Σ（その率の丸め済み行金額）
 *   3. 税額(率)   = round(対象額(率) × 率)   … **税の丸めは束ごとに 1 回**
 *   4. 小計      = Σ 対象額(率) ≡ subtotalYen(全行)
 *   5. 消費税    = Σ 税額(率)
 *   6. 合計      = 小計 + 消費税             … ここではもう丸めない
 *
 * 3 を「行ごとに丸める」にしてはいけない。単一税率でも結果が変わってしまう
 * （1005 円の行が 3 つ・10% なら、束ごとなら 302、行ごとなら 301）。単一税率のとき
 * `totalsYen` と完全に一致することが、この変更が既存の請求額を動かさない根拠。
 */
export function totalsByRateYen(lines: readonly TaxLineInput[]): TotalsByRate {
  const order: string[] = [];
  const byRate = new Map<string, { taxRate: number; taxableBase: number }>();

  for (const line of lines) {
    const key = bucketKey(line.taxRate);
    let bucket = byRate.get(key);
    if (bucket == null) {
      // 束の率は丸めた鍵から復元する（同じ束の中で率がぶれないように）。
      bucket = { taxRate: Number(key), taxableBase: 0 };
      byRate.set(key, bucket);
      order.push(key);
    }
    bucket.taxableBase += roundYen(line.amount);
  }

  const buckets: TaxBucket[] = order
    .map((key) => {
      const b = byRate.get(key) as { taxRate: number; taxableBase: number };
      return {
        taxRate: b.taxRate,
        taxableBase: b.taxableBase,
        taxAmount: taxAmountYen(b.taxableBase, b.taxRate),
      };
    })
    .sort((a, b) => b.taxRate - a.taxRate);

  const subtotal = buckets.reduce((sum, b) => sum + b.taxableBase, 0);
  const taxAmount = buckets.reduce((sum, b) => sum + b.taxAmount, 0);
  return { subtotal, taxAmount, totalAmount: subtotal + taxAmount, buckets };
}
