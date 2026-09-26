/**
 * inventory-owner-core.ts — 在庫バケットの**所有者**を決める純ロジック。依存なし。
 *
 * item_inventory には 2 つの「誰」がある:
 *   custody_bp_id  いま誰が持っているか（外注先に預けている分）
 *   owner_bp_id    誰の物か（再研磨で預かった顧客の工具）
 * どちらも null が自社。両方入ることもある（預り品をコーティング外注へ出した状態）。
 *
 * 所有者は**注文明細の種別から決まる**: 再研磨（REGRIND）の明細に載る物は顧客の
 * 物で、それ以外は自社の物。出荷・返品・受入がそれぞれ別の場所でこの判断を
 * していると、片方だけ直したときに顧客の工具が自社在庫から出ていく（あるいは
 * 逆）ので、ここに 1 つだけ置く。
 *
 * ★ **nextjs-kiosk との twin file**（逐語コピー）。原本はこちら（nextjs-web）で、
 *   `pnpm twin:sync` で複製する。inventory.ts（twin）が読むため。
 */

/** 顧客の物として扱う注文種別。 */
export const CUSTOMER_OWNED_ORDER_TYPES: readonly string[] = ["REGRIND"];

/** その注文種別の明細に載る物は顧客の物か。 */
export function isCustomerOwnedOrderType(
  orderType: string | null | undefined,
): boolean {
  return orderType != null && CUSTOMER_OWNED_ORDER_TYPES.includes(orderType);
}

/**
 * 明細の種別と書類の顧客から、動かすバケットの所有者を返す。
 * null = 自社のバケット。顧客所有の種別なのに顧客が無いときは throw —
 * 黙って自社にすると、顧客の工具が自社在庫として出荷される。
 */
export function ownerBucketFor(
  orderType: string | null | undefined,
  customerBpId: string | null | undefined,
): string | null {
  if (!isCustomerOwnedOrderType(orderType)) return null;
  if (!customerBpId) {
    throw new Error("ownerBucketFor: customer-owned line without a customer");
  }
  return customerBpId;
}
