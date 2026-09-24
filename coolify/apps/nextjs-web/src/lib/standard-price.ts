import "server-only";

import { prisma } from "@/lib/db";

/**
 * standard-price.ts — 品目の**標準価格**（定価）を読む 1 か所。
 *
 * 値段の決まり方は 2 段で、S/4HANA の「品目の定価 + 顧客ごとの条件レコード」と
 * 同じ順:
 *
 *   1. 品目の標準価格（items.standard_unit_price）… 顧客を問わない
 *   2. 顧客ごとの価格表（price_list_entries）… あればこちらが勝つ
 *
 * 落とし込みは resolvePriceFromEntries の `standardUnitPrice` 引数で、
 * **当たる価格表が無いときだけ**標準価格へ落ちる。
 *
 * ## なぜ品目の種別で絞るのか
 *
 * **いま標準価格を読むのは再研磨の品目だけ。** 製品は従来どおり「価格表が
 * 無ければ単価を解決できない」ままにする — 見積書がその性質に依っていて
 * （価格表からのみ作成できる）、ここを黙って広げると、価格表を作り忘れた製品が
 * エラーにならずに定価で売れてしまう。
 *
 * 広げるのは**意図してやること**で、そのときに直すのはこのファイルの
 * `STANDARD_PRICE_ITEM_TYPES` 1 か所で済むようにしてある。
 */

/** 標準価格を読む品目の種別。広げるときはここだけを変える。 */
export const STANDARD_PRICE_ITEM_TYPES = ["REGRIND"] as const;

/** 数値化（Decimal | null → number | null）。 */
function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 品目 id → 標準価格。標準価格を持たない品目・対象外の種別は**載らない**
 * （呼び出し側は `?? null` で「無い」として扱う）。
 */
export async function loadStandardUnitPrices(
  itemIds: readonly (number | string | null | undefined)[],
): Promise<Map<number, number>> {
  const ids = [
    ...new Set(
      itemIds
        .map((id) => (id == null || id === "" ? null : Number(id)))
        .filter((id): id is number => id != null && Number.isInteger(id)),
    ),
  ];
  if (ids.length === 0) return new Map();
  const rows = await prisma.item.findMany({
    where: {
      id: { in: ids },
      itemType: { in: [...STANDARD_PRICE_ITEM_TYPES] },
      standardUnitPrice: { not: null },
    },
    select: { id: true, standardUnitPrice: true },
  });
  const out = new Map<number, number>();
  for (const r of rows) {
    const price = toNumber(r.standardUnitPrice);
    if (price != null) out.set(r.id, price);
  }
  return out;
}
