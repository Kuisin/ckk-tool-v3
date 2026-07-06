/**
 * doc-number.ts — combined-key document numbers (client-safe, pure).
 *
 * 試算/見積書 rows are keyed (year_month, seq) — the display number
 * EST-YYYYMM-NNNNN / QOT-YYYYMM-NNNNN is DERIVED from the key, never stored.
 * URL ids use the formatted number; `parseDocKey` maps it back to the key.
 */

export interface DocKey {
  yearMonth: string;
  seq: number;
}

const DOC_FORMATS = {
  EST: { digits: 5 },
  QOT: { digits: 5 },
  PRD: { digits: 4 },
} as const;

export type DocPrefix = keyof typeof DOC_FORMATS;

/** (yearMonth, seq) → "EST-202607-00001". */
export function formatDocNumber(prefix: DocPrefix, key: DocKey): string {
  const { digits } = DOC_FORMATS[prefix];
  return `${prefix}-${key.yearMonth}-${String(key.seq).padStart(digits, "0")}`;
}

export const formatEstimateNumber = (key: DocKey) =>
  formatDocNumber("EST", key);
export const formatQuoteNumber = (key: DocKey) => formatDocNumber("QOT", key);

/**
 * 製品コード PRD-YYYYMM-NNNN — (year_month, seq) から導出。
 * レガシー取込の製品はコード未採番（yearMonth/seq が null）→ null を返す。
 */
export function formatProductNumber(
  yearMonth: string | null,
  seq: number | null,
): string | null {
  if (!yearMonth || seq == null) return null;
  return formatDocNumber("PRD", { yearMonth, seq });
}

/**
 * "EST-202607-00001" (or a bare "202607-00001") → { yearMonth, seq }.
 * Returns null when the string is not a valid document id.
 */
export function parseDocKey(id: string, prefix?: DocPrefix): DocKey | null {
  const m = /^(?:([A-Z]{3})-)?(\d{6})-(\d{1,6})$/.exec(id);
  if (!m) return null;
  if (prefix && m[1] && m[1] !== prefix) return null;
  const seq = Number(m[3]);
  if (!Number.isInteger(seq) || seq < 1) return null;
  return { yearMonth: m[2], seq };
}

/** URL-safe entry key for 価格表 — `{customerId}__{productId}__{orderType}`. */
export function priceEntryKey(
  customerBpId: string,
  productId: number,
  orderType: string,
): string {
  return `${customerBpId}__${productId}__${orderType}`;
}

/** Parse a price-list entry key back into its parts (null if malformed). */
export function parsePriceEntryKey(
  key: string,
): { customerBpId: string; productId: number; orderType: string } | null {
  const parts = key.split("__");
  if (parts.length !== 3 || parts.some((p) => !p)) return null;
  const [customerBpId, productIdRaw, orderType] = parts;
  const productId = Number(productIdRaw);
  if (!Number.isInteger(productId) || productId < 1) return null;
  return { customerBpId, productId, orderType };
}
