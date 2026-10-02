"use client";

/**
 * useStandardPrices — 明細に載っている品目の**標準価格**を引く（顧客の価格表を
 * 引く `usePriceEntries` と対）。
 *
 * 値段は 2 段（品目の標準価格 → 顧客の価格表が上書き）。価格表は顧客ごとに
 * まとめて取れるが、標準価格は品目に付いているので、行で選ばれた品目の分だけを
 * 引く。**これが無いと画面は「価格表なし」と出すのにサーバーは標準価格で保存する。**
 *
 * 品目の集合が変わったときだけ引き直す（数量や種別を打つたびに往復させない）。
 */

import { useEffect, useState } from "react";
import { fetchStandardUnitPrices } from "@/app/(dashboard)/_shared/standard-price-lookup";

export function useStandardPrices(
  itemIds: readonly (string | null | undefined)[],
): Record<string, number> {
  const [prices, setPrices] = useState<Record<string, number>>({});
  // 集合として扱う（並び順や重複で引き直さない）。
  const key = [...new Set(itemIds.filter((id): id is string => !!id))]
    .sort()
    .join(",");

  useEffect(() => {
    if (!key) {
      setPrices({});
      return;
    }
    let alive = true;
    // 続けて選び直したとき、遅れて届いた前の結果で上書きしない。
    fetchStandardUnitPrices(key.split(","))
      .then((rows) => {
        if (alive) setPrices(rows);
      })
      .catch(() => {
        if (alive) setPrices({});
      });
    return () => {
      alive = false;
    };
  }, [key]);

  return prices;
}
