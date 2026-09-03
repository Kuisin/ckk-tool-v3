"use client";

/**
 * usePriceEntries — 明細エディタが引く「その顧客の価格表」。
 *
 * 単価は既定で価格表が持つ（§2）ので、編集中の画面は行ごとの価格表単価を
 * その場で出せなければならない。顧客は編集中に変わりうるため、**顧客が
 * 決まるたびにその顧客のエントリだけを取り直す** — 見積書フォームのように
 * 全顧客分を最初から配ると、顧客数 × 製品数のエントリを毎回送ることになる。
 *
 * 解決自体はエントリを使ったクライアント側の pure 計算（数量を打つたびに
 * 往復させない）。保存時はサーバーが同じ解決をやり直すので、ここで得た値は
 * 表示のためのもの。
 */

import { useEffect, useState } from "react";
import { fetchAcceptancePriceEntries } from "@/app/(dashboard)/sales/order-acceptances/price-lookup";
import type { PriceListEntry } from "@/components/sales/price-lists/model";

/**
 * 顧客の価格表エントリ。顧客未指定 / 取得前は空配列 — 画面は「価格表なし」
 * として自由入力に倒れる（誤って「価格表どおり」と見せない）。
 */
export function usePriceEntries(customerBpId: string | null): PriceListEntry[] {
  const [entries, setEntries] = useState<PriceListEntry[]>([]);

  useEffect(() => {
    if (!customerBpId) {
      setEntries([]);
      return;
    }
    let alive = true;
    // 顧客を続けて変えたとき、遅れて届いた前の顧客の結果で上書きしない。
    fetchAcceptancePriceEntries(customerBpId)
      .then((rows) => {
        if (alive) setEntries(rows);
      })
      .catch(() => {
        if (alive) setEntries([]);
      });
    return () => {
      alive = false;
    };
  }, [customerBpId]);

  return entries;
}
