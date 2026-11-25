/**
 * wo-list-core.ts — 指示書一覧（/wo-list）の検索。純ロジック（I/O なし）。
 *
 * 検索欄 1 つで 指示書番号（ロット番号）・書類番号（WOR-…）・製品名・
 * 製品コードのどれでも引ける。空白区切りの語は AND（全部を含む行だけ）。
 * 大文字小文字・全角半角の英数字は区別しない — 現場のタブレットの
 * ソフトキーボードは全角で打たれがち。
 */

export interface WoListItem {
  workOrderNumber: number;
  docNumber: string;
  /** WORK_ORDER_STATUS（APPROVED | IN_PROGRESS）。 */
  status: string;
  plannedQuantity: number;
  productCode: string | null;
  productName: string;
  /** 完了した工程 / キャンセルを除く全工程。 */
  doneSteps: number;
  totalSteps: number;
}

/** 全角英数字・記号 → 半角、英字は小文字。 */
export function normalizeQuery(s: string): string {
  return s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .toLowerCase()
    .trim();
}

export function filterWoList(
  items: readonly WoListItem[],
  query: string,
): WoListItem[] {
  const terms = normalizeQuery(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...items];
  return items.filter((it) => {
    const hay = normalizeQuery(
      [
        String(it.workOrderNumber),
        `#${it.workOrderNumber}`,
        it.docNumber,
        it.productCode ?? "",
        it.productName,
      ].join(" "),
    );
    return terms.every((t) => hay.includes(t));
  });
}
