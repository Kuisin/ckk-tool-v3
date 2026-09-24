"use server";

/**
 * standard-price-lookup.ts — 明細エディタが**標準価格**をその場で引くための
 * 読み取り口（価格表の `price-lookup.ts` と同じ役割）。
 *
 * 値段は 2 段で決まる（品目の標準価格 → 顧客の価格表が上書き）。価格表のほうは
 * 顧客が決まるたびにまとめて取ってあるが、標準価格は**品目に付いている**ので、
 * 行で品目を選んだときに引く。
 *
 * これが無いと、画面は「価格表なし」と出すのにサーバーは標準価格で保存する —
 * 「見えている単価」と「保存される単価」がずれる。保存側の解決
 * （`lib/standard-price.ts`）と同じ品目種別だけを返すので、ずれようが無い。
 */

import { checkPermission } from "@/lib/authz";
import { loadStandardUnitPrices } from "@/lib/standard-price";

/**
 * 品目 id → 標準価格。標準価格を持たない品目・対象外の種別は**載らない**。
 * 権限が無ければ空（画面は「価格表なし」に倒れ、保存はサーバーが解決し直す）。
 */
export async function fetchStandardUnitPrices(
  itemIds: readonly string[],
): Promise<Record<string, number>> {
  const authz = await checkPermission("order_acceptance", "READ");
  const quoteAuthz = authz.ok ? null : await checkPermission("quote", "READ");
  if (!authz.ok && !quoteAuthz?.ok) return {};
  const map = await loadStandardUnitPrices(itemIds);
  return Object.fromEntries([...map].map(([id, price]) => [String(id), price]));
}
