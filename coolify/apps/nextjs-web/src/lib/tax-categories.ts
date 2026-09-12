import "server-only";

/**
 * tax-categories.ts — 税区分マスタの読み出し（server-only）。
 *
 * 判定は一切しない — 区分と率を決めるのは純ロジックの lib/tax-rate.ts
 * （`resolveLineTax`）で、ここは「DB の行を `TaxCatalog` の形にする」だけ。
 * material-pricing.ts（server）と material-pricing-core.ts（純）の分け方と同じ。
 *
 * **クライアントはこれを呼べない。** 見積フォームのライブ計算はサーバー側の
 * page.tsx がカタログを props で渡す（`taxTypeByCustomer` を渡していたのと同じ流儀）。
 */

import { cache } from "react";
import { prisma } from "./db";
import { type LocalizedText, localized } from "./format";
import {
  EMPTY_TAX_CATALOG,
  type TaxCatalog,
  type TaxCategoryRef,
} from "./tax-rate";

/** JSON の { ja, en } から ja / en をそのまま取り出す（表示側の locale 解決は別）。 */
function jaEn(value: unknown): { ja: string; en: string } {
  const ja = localized(value as LocalizedText, "ja");
  const en = localized(value as LocalizedText, "en");
  return { ja, en: en || ja };
}

/**
 * 有効な税区分と率の履歴を 1 式読む。`cache()` 済みなので 1 リクエスト内で
 * 何度呼んでも DB は 1 回。
 *
 * **無効化した区分 (`isActive = false`) も読む。** 発行済みの書類がその区分を
 * 指しているので、無効化した瞬間に過去の請求書のラベルが引けなくなってはいけない
 * （新規に選ばせないのは画面側の仕事）。
 */
export const loadTaxCatalog = cache(async (): Promise<TaxCatalog> => {
  const rows = await prisma.taxCategory.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      shortLabel: true,
      isDefault: true,
      rates: { select: { effectiveFrom: true, rate: true } },
    },
    orderBy: { sortOrder: "asc" },
  });
  if (rows.length === 0) return EMPTY_TAX_CATALOG;

  const categories: TaxCategoryRef[] = rows.map((r) => {
    const name = jaEn(r.name);
    const short = r.shortLabel == null ? null : jaEn(r.shortLabel);
    return {
      id: r.id,
      code: r.code,
      nameJa: name.ja,
      nameEn: name.en,
      shortLabelJa: short?.ja ?? null,
      shortLabelEn: short?.en ?? null,
      rates: r.rates.map((rate) => ({
        // DATE 列は UTC 00:00 の Date で返るので、暦日は UTC 側から切り出す
        // （JST へ寄せると 1 日ずれる）。
        effectiveFrom: rate.effectiveFrom.toISOString().slice(0, 10),
        rate: Number(rate.rate),
      })),
    };
  });

  return {
    categories,
    defaultCategoryId: rows.find((r) => r.isDefault)?.id ?? null,
  };
});
