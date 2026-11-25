/**
 * doc-sort.ts — 一覧の「書類番号」列を並べ替えるときの値（pure・client-safe）。
 *
 * 一覧の行が持つ番号は id の姿（`CKK~QOT-2026-00012` — lib/doc-number.ts）。
 * これを文字列のまま比べると**法人コードが先に効く**（コードの長さや文字で
 * 並びが割れる）。番号の本体 `PREFIX-FFFF-NNNNN` は年度 4 桁・連番 5 桁の
 * 固定幅なので、本体を先に比べれば「会計年度 → 年度内連番」の順になる。
 * サーバーの既定の並び（orderBy fiscalYear, docSeq）と同じ順で、同じ番号が
 * 2 つの法人にあるときだけ法人コードで分ける。
 *
 * 注文明細（`ORD-FFFF-NNNNN-NN`）も同じ — 枝番は本体のあとに続く。
 */

import { docNo } from "./doc-number";

const COMPANY = /^([^~/]+)[~/]/;

/** 並べ替えの値。番号が無い行（null / 空）は先頭か末尾にまとまる空文字。 */
export function docSortValue(id: string | null | undefined): string {
  if (!id) return "";
  const number = docNo(id);
  // 法人コードを落とせたときだけ法人がある（ロット表記などはそのまま比べる）
  const company = number !== id ? (COMPANY.exec(id)?.[1] ?? "") : "";
  return `${number}\u0000${company}`;
}
