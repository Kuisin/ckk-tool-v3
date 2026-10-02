/**
 * regrind-item-label.ts — 再研磨品目の 1 行表示。
 *
 * ピッカー（`option-search.ts`）と再研磨品目マスタ (MS0H) の両方が読むので
 * ここに置く。`option-search.ts` は `"use server"` ファイルで、**async 関数
 * しか export できない**（定数や同期関数を置くとクライアントにはアクション
 * 参照が渡り、実行時に画面ごと落ちる）。
 *
 * 純関数 — DB も権限も見ない。
 */

import { type LocalizedText, localized } from "@/lib/format";

/**
 * 再研磨の品目の 1 行表示。**値段を出す** — どれを選ぶかは値段で決まるので、
 * 名前だけ並べても選べない（旧 再研マスタも金額の表だった）。
 */
export function regrindItemLabel(r: {
  code: string | null;
  name: unknown;
  regrindToolClass?: string | null;
  regrindLocation?: string | null;
  regrindFlutes?: number | null;
  regrindSizeMinMm?: unknown;
  regrindSizeMaxMm?: unknown;
  standardUnitPrice?: unknown;
}): string {
  const name = localized(r.name as LocalizedText | null);
  const cond = [
    r.regrindToolClass,
    r.regrindLocation,
    r.regrindFlutes != null ? `${r.regrindFlutes}枚刃` : null, // i18n-ignore
    regrindSizeBandLabel(r.regrindSizeMinMm, r.regrindSizeMaxMm),
  ]
    .filter((x): x is string => !!x)
    .join(" / ");
  const price =
    r.standardUnitPrice != null && Number.isFinite(Number(r.standardUnitPrice))
      ? `¥${Number(r.standardUnitPrice).toLocaleString("ja-JP")}`
      : null;
  return [name, cond, price, r.code].filter(Boolean).join(" · ");
}

/** サイズ帯の表示（min < 径 ≤ max）。両方 null なら空。 */
export function regrindSizeBandLabel(
  min: unknown,
  max: unknown,
): string | null {
  const lo = min == null ? null : Number(min);
  const hi = max == null ? null : Number(max);
  if (lo == null && hi == null) return null;
  // 寸法の記法（φ・超・以下）は日本語の図面表記そのもので、訳す対象ではない。
  if (lo == null) return `φ${hi} 以下`; // i18n-ignore
  if (hi == null) return `φ${lo} 超`; // i18n-ignore
  return `φ${lo} 超 ${hi} 以下`; // i18n-ignore
}
