/**
 * doc-fields.ts — `/api/v1` の書類 DTO が共通で持つ「番号まわり」の項目。
 *
 * 番号設計 PR-C: 書類番号は DB が払い出す `PREFIX-FFFF-NNNNN`
 * （例 `QOT-2026-00001`）で、連番は「自社法人 × 会計年度」ごと。
 * **同じ番号が 2 つの法人に存在し得る**ので、機械向けの契約では
 * 番号だけで行を同定させない — `id`（行の uuid）か `companyCode` + `number`
 * の組で同定してもらう（`_specs/api.md` §6.3）。
 *
 * route.ts ではないので口にはならない（Next.js は route.ts だけを口にする）。
 */

import { docRefCompany, docRefNumber } from "@/lib/doc-ref-core";

/** 書類の一覧クエリが必ず選ぶ列（Prisma の select に展開する）。 */
export const DOC_FIELDS_SELECT = {
  id: true,
  docRef: true,
  fiscalYear: true,
  legacyNumber: true,
} as const;

export interface DocFieldsRow {
  id: string;
  docRef: string;
  fiscalYear: number;
  legacyNumber: string | null;
}

/**
 * 行 → 番号まわりの項目。`number` は従来からある項目（値が新しい形の番号に
 * なった）で、`docNumber` はその別名。
 */
export function docFields(r: DocFieldsRow) {
  const number = docRefNumber(r.docRef);
  return {
    /** 行の uuid。差分同期の突き合わせはこれで行う（番号は法人をまたいで重なる）。 */
    id: r.id,
    /** 書類番号 `PREFIX-FFFF-NNNNN`。**法人ごとの連番** — 単独では一意でない。 */
    number,
    /** 発行した自社法人のコード。`companyCode` + `number` で書類が 1 つに決まる。 */
    companyCode: docRefCompany(r.docRef),
    /** 番号に入っている会計年度（法人の年度開始月で区切る）。 */
    fiscalYear: r.fiscalYear,
    /** `number` と同じ値。 */
    docNumber: number,
    /** 旧番号 `PREFIX-YYYYMM-NNNNN`（番号設計の切り替え前に採番された書類だけ）。 */
    legacyNumber: r.legacyNumber,
  };
}

/** 親書類など、関係の先の番号（無ければ null）。 */
export function relatedDocNumber(
  row: { docRef: string } | null | undefined,
): string | null {
  return row ? docRefNumber(row.docRef) : null;
}
