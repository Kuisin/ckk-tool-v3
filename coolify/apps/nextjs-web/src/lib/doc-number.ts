/**
 * doc-number.ts — combined-key document numbers (client-safe, pure).
 *
 * 価格試算/見積書 rows are keyed (year_month, seq) — the display number
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
  DOR: { digits: 5 },
  DRN: { digits: 5 },
  INV: { digits: 5 },
  ORD: { digits: 5 }, // 注文請書（注文明細の枝番なし基底番号）
  WOR: { digits: 5 }, // 指示書（書類番号 — ロット番号は別の通し連番 int）
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
  // プレフィクスは 2〜4 文字（WO / PO / EST / …）
  const m = /^(?:([A-Z]{2,4})-)?(\d{6})-(\d{1,6})$/.exec(id);
  if (!m) return null;
  if (prefix && m[1] && m[1] !== prefix) return null;
  const seq = Number(m[3]);
  if (!Number.isInteger(seq) || seq < 1) return null;
  return { yearMonth: m[2], seq };
}

// ─── 注文明細番号（3 パート: ORD-YYYYMM-NNNNN-NN） ────────────────────────────

export interface OrderLineKey {
  yearMonth: string;
  seq: number;
  branch: number;
}

/** (yearMonth, seq, branch) → "ORD-202607-00001-01"。URL id にも使用。 */
export function formatOrderLineNumber(key: OrderLineKey): string {
  return `ORD-${key.yearMonth}-${String(key.seq).padStart(5, "0")}-${String(key.branch).padStart(2, "0")}`;
}

/**
 * DB 行（注文請書キー + 枝番）→ 表示番号。枝番は確定時に採番されるため、
 * 未確定の行は番号を持たない → null。
 */
export function orderLineNumberOf(row: {
  acceptanceYearMonth: string;
  acceptanceSeq: number;
  branch: number | null;
}): string | null {
  if (row.branch == null) return null;
  return formatOrderLineNumber({
    yearMonth: row.acceptanceYearMonth,
    seq: row.acceptanceSeq,
    branch: row.branch,
  });
}

/** 注文明細行 → Prisma の複合ユニークキー（確定済みのみ）。 */
export function orderLineWhereKey(key: OrderLineKey) {
  return {
    acceptanceYearMonth_acceptanceSeq_branch: {
      acceptanceYearMonth: key.yearMonth,
      acceptanceSeq: key.seq,
      branch: key.branch,
    },
  };
}

const ORDER_LINE_RE = /^(?:ORD-)?(\d{6})-(\d{1,6})-(\d{1,2})$/i;

/** "ORD-202607-00001-01"（prefix 省略可）→ キー。不一致は null。 */
export function parseOrderLineKey(id: string): OrderLineKey | null {
  const m = ORDER_LINE_RE.exec(id.trim());
  if (!m) return null;
  const seq = Number(m[2]);
  const branch = Number(m[3]);
  if (!Number.isInteger(seq) || seq < 1) return null;
  if (!Number.isInteger(branch) || branch < 1) return null;
  return { yearMonth: m[1], seq, branch };
}
