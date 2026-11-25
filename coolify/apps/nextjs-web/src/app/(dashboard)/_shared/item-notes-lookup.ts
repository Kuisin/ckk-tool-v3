"use server";

/**
 * item-notes-lookup.ts — 明細エディタが品目マスタの**備考**をその場で引く口。
 *
 * 見積書の明細で品目を選んだとき、明細の備考が空ならマスタの備考を下書きとして
 * 入れる（利用者が書き換えてよい。保存されるのは明細の備考だけで、マスタは
 * 読むだけ）。`standard-price-lookup.ts` と同じ形。
 */

import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";

/**
 * 品目 id → 備考。備考が空の品目は**載らない**。
 * 権限が無ければ空（下書きが入らないだけで、保存には影響しない）。
 */
export async function fetchItemNotes(
  itemIds: readonly string[],
): Promise<Record<string, string>> {
  const authz = await checkPermission("quote", "READ");
  if (!authz.ok) return {};
  const ids = [
    ...new Set(
      itemIds.map(Number).filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  if (ids.length === 0) return {};
  const rows = await prisma.item.findMany({
    where: { id: { in: ids }, notes: { not: null } },
    select: { id: true, notes: true },
  });
  const out: Record<string, string> = {};
  for (const r of rows) {
    const notes = r.notes?.trim();
    if (notes) out[String(r.id)] = notes;
  }
  return out;
}
