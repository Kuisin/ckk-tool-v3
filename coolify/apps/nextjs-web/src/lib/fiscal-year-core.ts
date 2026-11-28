/**
 * fiscal-year-core.ts — 書類番号の会計年度と番号の形。純粋関数・試験あり。
 *
 * **DB 関数の双子**（マイグレーション 20261126150000_document_sequences）:
 *   - `jstDate`         ↔ `app.jst_date(timestamptz)`
 *   - `fiscalYearOf`    ↔ `app.fiscal_year_of(start_month, date)`
 *   - `formatDocNumber` ↔ `app.format_doc_number(prefix, fy, seq)`
 * 番号を**払い出すのは DB だけ**（`app.allocate_document_seq`）。ここは画面の
 * 表示・前もっての見込み表示・試験のためにある。片方を直したらもう片方も直す —
 * 同じ境界の試験を `shared-db/ci/sql-tests/document-sequences.sql` が SQL 側で持つ。
 *
 * 決定（利用者、2026-11-25）:
 *   - 番号は `PREFIX-FFFF-NNNNN`（例 `QOT-2026-00001`）。連番は自社法人 × 会計年度。
 *   - 年度のラベル = 年度が**始まる暦年**。開始月は法人ごと（CKK・TSP とも 4 月）。
 *   - 年度は**書類自身の日付**（無ければ作成日時）を**日本時間の暦日**にして決める。
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000; // 日本は夏時間が無いので固定でよい

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 時刻 → 日本時間の暦日（`YYYY-MM-DD`）。 */
export function jstDate(instant: Date): string {
  const t = instant.getTime();
  if (Number.isNaN(t)) throw new RangeError("jstDate: invalid date");
  return new Date(t + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 会計年度。`date` は日本時間の暦日（`YYYY-MM-DD`）か時刻（`Date` — 日本時間の
 * 暦日に直してから引く）。開始月以上ならその暦年、未満なら前年。
 */
export function fiscalYearOf(startMonth: number, date: string | Date): number {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    throw new RangeError(
      `fiscalYearOf: start month must be 1..12 (got ${startMonth})`,
    );
  }
  const iso = typeof date === "string" ? date : jstDate(date);
  const m = ISO_DATE.exec(iso);
  if (!m)
    throw new RangeError(`fiscalYearOf: expected YYYY-MM-DD (got ${iso})`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  return month >= startMonth ? year : year - 1;
}

/** `QOT`, 2026, 1 → `QOT-2026-00001`。形を外れる入力は丸めずに拒否する。 */
export function formatDocNumber(
  prefix: string,
  fiscalYear: number,
  seq: number,
): string {
  if (!/^[A-Z]{2,4}$/.test(prefix)) {
    throw new RangeError(`formatDocNumber: bad prefix ${prefix}`);
  }
  if (!Number.isInteger(fiscalYear) || fiscalYear < 1000 || fiscalYear > 9999) {
    throw new RangeError(
      `formatDocNumber: fiscal year must be 4 digits (got ${fiscalYear})`,
    );
  }
  if (!Number.isInteger(seq) || seq < 1 || seq > 99999) {
    throw new RangeError(`formatDocNumber: seq must be 1..99999 (got ${seq})`);
  }
  return `${prefix}-${fiscalYear}-${String(seq).padStart(5, "0")}`;
}
