import "server-only";

/**
 * item-legacy-material.ts — 品目統合 第 2 段 B の書き込み橋。
 *
 * material_purchase_order_items / material_receipts / purchase_request_items
 * の `material_id` 列はまだ NOT NULL（旧列を落とすのは最後の段）。アプリは
 * もう `items.id` だけを扱うが、この 3 表へ行を作るときは旧列も埋めないと
 * INSERT が落ちる。ここは**その 1 回だけの橋** — 読み取り・突合・業務判定は
 * 一切ここを通らない（すべて items 側）。
 *
 * `materials.item_id` は unique なので対応は必ず 1:1。品目が
 * `searchMaterialItemOptions`（`itemType: "MATERIAL"`）由来である限り、
 * 対応する materials 行が無いことはない（items は materials から作られた鏡 —
 * items.prisma 冒頭コメント）。
 */

import { prisma } from "./db";

/** 品目 id（複数） → 対応する materials.id のマップ。無い id は含まれない。 */
export async function legacyMaterialIdsForItems(
  itemIds: readonly number[],
): Promise<Map<number, number>> {
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) return new Map();
  const rows = await prisma.material.findMany({
    where: { itemId: { in: ids } },
    select: { id: true, itemId: true },
  });
  return new Map(rows.map((r) => [r.itemId as number, r.id]));
}

/** 品目 id 1 件 → 対応する materials.id。対応が無ければ null。 */
export async function legacyMaterialIdForItem(
  itemId: number,
): Promise<number | null> {
  const row = await prisma.material.findFirst({
    where: { itemId },
    select: { id: true },
  });
  return row?.id ?? null;
}
