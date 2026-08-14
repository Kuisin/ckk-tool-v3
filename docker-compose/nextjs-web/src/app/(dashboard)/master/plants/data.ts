/**
 * data.ts — 拠点マスタ (MS0B) の共有サーバーサイド取得ヘルパ。
 */

import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

/** 地域 Select の選択肢（有効のみ。value = String(region id)）。 */
export async function fetchRegionOptions(): Promise<
  { value: string; label: string }[]
> {
  const rows = await prisma.region.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });
  return rows.map((r) => ({
    value: String(r.id),
    label: `${r.code} ${localized(r.name as LocalizedText | null)}`,
  }));
}
