/**
 * price-resolve.ts — 注文請書 明細の単価を価格表から解決する（サーバー側）。
 *
 * 価格表どおりの行（= 上書きが入っていない行）の単価は**サーバーが決める**。
 * クライアントが送ってきた数字は、その行では読まない — 画面が古い / 手で
 * 作った POST でも、宣言のない行に価格表と違う単価が入ることはない。
 * 上書きが入っている行はそのまま人の値を保存する。
 *
 * 解決ロジックは見積書・価格照合と同一（components/sales/quotes/model の
 * pure 関数 + fetchEntriesForCustomer）— 「どこで見た単価か」で結果が変わって
 * よい場所ではないので、実装を増やさない。
 *
 * サーバー専用（prisma 経由の読み込み）。actions.ts の保存と price-check.ts の
 * 照合が同じ入口を通る。
 */

import type { getTranslations } from "next-intl/server";
import type { PriceListEntry } from "@/components/sales/price-lists/model";
import { resolvePriceFromEntries } from "@/components/sales/quotes/model";
import {
  effectiveUnitPrice,
  normalizeOverride,
  type PriceMissReason,
} from "@/lib/order-acceptance-price-core";
import { fetchEntriesForCustomer } from "../quotes/data";

type Tr = Awaited<ReturnType<typeof getTranslations>>;

/** 照合・解決に必要な明細 1 行ぶん。 */
export interface PriceResolvableItem {
  /** 製品マスタ内部 id（文字列）。null = 未突合 → 価格表を引けない。 */
  productId: string | null;
  orderType: string;
  quantity: number;
}

/**
 * 顧客の価格表エントリ。顧客未特定は空 — 価格表は顧客ごとなので、
 * 顧客が決まるまで単価は解決できない（照合も行われない）。
 */
export async function loadCustomerPriceEntries(
  customerBpId: string | null,
): Promise<PriceListEntry[]> {
  if (!customerBpId) return [];
  return fetchEntriesForCustomer(customerBpId);
}

/** 1 行の価格表単価と、引けなかったときの理由。 */
export interface PriceListLookup {
  /** 価格表から解決した単価。null = 引けない。 */
  expected: number | null;
  /** expected が null の理由（顧客・製品未特定なら null）。 */
  missReason: PriceMissReason | null;
}

/**
 * 1 行の価格表単価（¥）と理由。
 * 値引きはここでは見ない — 注文請書の単価は価格表の段階単価そのもの
 * （値引きは見積書の金額計算の話で、受注単価は顧客の注文書と突き合わせる）。
 *
 * 理由を返すのは、照合（price-check）が「価格表なし」と「価格表はあるのに
 * 数量段階が無い」を分けるため — 後者は差異と同じく確認を要求する。
 */
export function priceListLookup(
  entries: PriceListEntry[],
  customerBpId: string | null,
  item: PriceResolvableItem,
  tr: Tr,
): PriceListLookup {
  if (!customerBpId || !item.productId)
    return { expected: null, missReason: null };
  const r = resolvePriceFromEntries(
    entries,
    customerBpId,
    item.productId,
    item.orderType,
    item.quantity,
    tr,
  );
  return r.ok
    ? { expected: r.price.unitPrice, missReason: null }
    : { expected: null, missReason: r.reason };
}

/** `priceListLookup` の単価だけ版。引けなければ null。 */
export function priceListUnitPrice(
  entries: PriceListEntry[],
  customerBpId: string | null,
  item: PriceResolvableItem,
  tr: Tr,
): number | null {
  return priceListLookup(entries, customerBpId, item, tr).expected;
}

/** 保存する明細 1 行（入力の形 — actions.ts の zod 出力の部分集合）。 */
type SaveItem = PriceResolvableItem & {
  unitPrice: number | null;
  priceOverridden?: boolean;
};

/**
 * 保存前の単価確定 — 価格表どおりの行は解決した単価に、上書きの行は人の値に。
 * 上書きの宣言は「該当する価格表がある行」でしか意味を持たないので、
 * ここで落とす（normalizeOverride）。
 */
export async function applyPriceListPrices<T extends SaveItem>(
  customerBpId: string | null,
  items: readonly T[],
  tr: Tr,
): Promise<(T & { unitPrice: number | null; priceOverridden: boolean })[]> {
  const entries = await loadCustomerPriceEntries(customerBpId);
  return items.map((it) => {
    const expected = priceListUnitPrice(entries, customerBpId, it, tr);
    const overridden = normalizeOverride({
      expected,
      overridden: it.priceOverridden === true,
    });
    return {
      ...it,
      unitPrice: effectiveUnitPrice({
        expected,
        entered: it.unitPrice,
        overridden,
      }),
      priceOverridden: overridden,
    };
  });
}
