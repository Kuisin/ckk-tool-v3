/**
 * charge-items.ts — 料金マスタの読み口（server-only）。
 *
 * 金額の決まり方の判断は lib/charge-core.ts（純ロジック・試験あり）が持ち、
 * ここは DB から選択肢を取ってくるだけ。
 */

import "server-only";

import { cache } from "react";
import type { ChargeAmountMode } from "./charge-core";
import { prisma } from "./db";
import { type LocalizedText, localized } from "./format";
import type { Locale } from "./i18n";

/** 追加料金を足す画面が使う、料金マスタ 1 件ぶんの選択肢。 */
export interface ChargeItemOption {
  id: number;
  code: string;
  label: string;
  amountMode: ChargeAmountMode;
  defaultAmount: number | null;
  taxCategoryId: number | null;
}

/**
 * 選べる料金項目（有効な行だけ）。
 *
 * **無効化した項目は出さない。** 税区分（loadTaxCategoryOptions）とは扱いが
 * 逆になるが、あちらは「すでにその区分を指している製品が動いている」ので
 * 選択肢から消すと編集画面で値が飛ぶのに対し、こちらは**これから足す行の
 * 選択肢**でしかない。すでに書いた行は項目名も金額も行に焼き込んであるので、
 * 無効化しても過去の書類は何も変わらない。
 */
export const loadChargeItemOptions = cache(
  async (locale: Locale): Promise<ChargeItemOption[]> => {
    const rows = await prisma.chargeItem.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        amountMode: true,
        defaultAmount: true,
        taxCategoryId: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      label: localized(r.name as LocalizedText | null, locale),
      amountMode: r.amountMode,
      defaultAmount: r.defaultAmount != null ? Number(r.defaultAmount) : null,
      taxCategoryId: r.taxCategoryId,
    }));
  },
);
