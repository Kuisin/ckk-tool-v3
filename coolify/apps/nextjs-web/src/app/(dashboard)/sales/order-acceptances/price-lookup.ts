"use server";

/**
 * price-lookup.ts — 明細エディタが単価を**その場で**引くための読み取り口。
 *
 * 明細の単価は既定で価格表が持つので、画面は「いまこの行の価格表単価はいくらか」
 * を編集中に知る必要がある（保存してから知るのでは、上書きするかどうかを
 * 決められない）。顧客は編集中に変わりうるため、顧客が決まるたびにその顧客の
 * エントリだけを取り直す — 全顧客分をクライアントへ送らない。
 *
 * 解決そのものはクライアント側の pure 関数（quotes/model の
 * resolveUnitPriceFromEntries）で行う。数量を打つたびに往復させないため。
 * 保存時はサーバーがもう一度解決するので、ここは表示のための値でよい。
 */

import type { PriceListEntry } from "@/components/sales/price-lists/model";
import { checkPermission } from "@/lib/authz";
import { loadCustomerPriceEntries } from "./price-resolve";

/**
 * 指定顧客の価格表エントリ。権限が無い / 顧客未指定は空配列
 * （画面は「価格表なし」として自由入力に倒れる — 保存はサーバーが再解決する）。
 */
export async function fetchAcceptancePriceEntries(
  customerBpId: string | null,
): Promise<PriceListEntry[]> {
  const authz = await checkPermission("order_acceptance", "READ");
  if (!authz.ok) return [];
  return loadCustomerPriceEntries(customerBpId);
}
