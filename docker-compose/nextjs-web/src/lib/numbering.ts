/**
 * numbering.ts — document numbering on app.numbering_sequences
 * (_specs/tables.md §採番管理). Server-only.
 *
 * Formats: PRD-YYYYMM-NNNN (製品) / EST-, QOT- ... -NNNNN with monthly reset.
 * The increment is a single atomic INSERT ... ON CONFLICT statement, so
 * concurrent callers never receive the same number.
 */

import { prisma } from "./db";

const SEQUENCES = {
  PRODUCT: { prefix: "PRD", digits: 4 },
  ESTIMATE: { prefix: "EST", digits: 5 },
  QUOTE: { prefix: "QOT", digits: 5 },
  PRICE_LIST: { prefix: "PRC", digits: 5 },
  ORDER: { prefix: "ORD", digits: 5 }, // 受注書ベース（枝番は行側で 1..N）
} as const;

export type NumberingKey = keyof typeof SEQUENCES;

/**
 * Allocate the next (yearMonth, seq) pair for `key`. Documents with combined
 * keys (試算/見積書) store these two columns and DERIVE the display number
 * (lib/doc-number.ts); `nextDocumentNumber` keeps the formatted-string API for
 * single-column ids (製品コード).
 */
export async function allocateDocumentKey(
  key: NumberingKey,
): Promise<{ yearMonth: string; seq: number }> {
  const { prefix } = SEQUENCES[key];
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

  const rows = await prisma.$queryRaw<{ last_sequence: number }[]>`
    INSERT INTO "app"."numbering_sequences"
      ("key", "prefix", "last_year_month", "last_sequence", "updated_at")
    VALUES (${key}, ${prefix}, ${yearMonth}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "last_sequence" = CASE
        WHEN "numbering_sequences"."last_year_month" = ${yearMonth}
          THEN "numbering_sequences"."last_sequence" + 1
        ELSE 1
      END,
      "last_year_month" = ${yearMonth},
      "updated_at" = now()
    RETURNING "last_sequence"
  `;
  const seq = rows[0]?.last_sequence;
  if (!seq) throw new Error(`numbering failed for ${key}`);
  return { yearMonth, seq };
}

/** Next single-column document id, e.g. `PRD-202607-0012`. Resets monthly. */
export async function nextDocumentNumber(key: NumberingKey): Promise<string> {
  const { prefix, digits } = SEQUENCES[key];
  const { yearMonth, seq } = await allocateDocumentKey(key);
  return `${prefix}-${yearMonth}-${String(seq).padStart(digits, "0")}`;
}

// ── Global serials (no monthly reset) ────────────────────────────────────────

const SERIALS = {
  BP: { prefix: "BP", digits: 5 },
  WORK_ORDER: { prefix: "WO", digits: 5 }, // 指示書番号 = ロット番号（生 int で使用）
} as const;

export type SerialKey = keyof typeof SERIALS;

/** Next raw global serial (no reset). 指示書番号・ロット番号はこの生 int。 */
export async function nextSerialNumber(key: SerialKey): Promise<number> {
  const { prefix } = SERIALS[key];
  const rows = await prisma.$queryRaw<{ last_sequence: number }[]>`
    INSERT INTO "app"."numbering_sequences"
      ("key", "prefix", "last_year_month", "last_sequence", "updated_at")
    VALUES (${key}, ${prefix}, NULL, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "last_sequence" = "numbering_sequences"."last_sequence" + 1,
      "updated_at" = now()
    RETURNING "last_sequence"
  `;
  const seq = rows[0]?.last_sequence;
  if (!seq) throw new Error(`numbering failed for ${key}`);
  return seq;
}

/** Next global serial code, e.g. `BP-00012`. Never resets. */
export async function nextSerialCode(key: SerialKey): Promise<string> {
  const { prefix, digits } = SERIALS[key];
  const seq = await nextSerialNumber(key);
  return `${prefix}-${String(seq).padStart(digits, "0")}`;
}
