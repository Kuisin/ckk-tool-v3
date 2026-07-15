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
  PRC: { digits: 5 },
  PRD: { digits: 4 },
  SHP: { digits: 5 },
  DRN: { digits: 5 },
  INV: { digits: 5 },
  ORD: { digits: 5 }, // 受注請書（注文請書の枝番なし基底番号）
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
/** 価格表番号 PRC-YYYYMM-NNNNN — URL id にも使用。 */
export const formatPriceListNumber = (key: DocKey) =>
  formatDocNumber("PRC", key);

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

// ─── 注文請書番号（3 パート: ORD-YYYYMM-NNNNN-NN） ────────────────────────────

export interface SalesOrderKey {
  yearMonth: string;
  seq: number;
  branch: number;
}

/** (yearMonth, seq, branch) → "ORD-202607-00001-01"。URL id にも使用。 */
export function formatSalesOrderNumber(key: SalesOrderKey): string {
  return `ORD-${key.yearMonth}-${String(key.seq).padStart(5, "0")}-${String(key.branch).padStart(2, "0")}`;
}

const SALES_ORDER_RE = /^(?:ORD-)?(\d{6})-(\d{1,6})-(\d{1,2})$/i;

/** "ORD-202607-00001-01"（prefix 省略可）→ キー。不一致は null。 */
export function parseSalesOrderKey(id: string): SalesOrderKey | null {
  const m = SALES_ORDER_RE.exec(id.trim());
  if (!m) return null;
  const seq = Number(m[2]);
  const branch = Number(m[3]);
  if (!Number.isInteger(seq) || seq < 1) return null;
  if (!Number.isInteger(branch) || branch < 1) return null;
  return { yearMonth: m[1], seq, branch };
}
