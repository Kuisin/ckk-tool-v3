import "server-only";

/**
 * item-legacy-product.ts — 品目統合 第 2 段 D の書き込み橋（`item-legacy-material.ts`
 * の製品版）。
 *
 * work_orders.product_id / product_process_routes.product_id /
 * inspection_templates.product_id / design_requests.product_id /
 * design_files.product_id はまだ残っている（落とすのは最後の段。work_orders だけ
 * NOT NULL、他は nullable だが CHECK やアプリの必須項目がまだ productId を要る
 * ことがある）。アプリはもう `items.id`（itemType: "PRODUCT"）だけを扱うが、この
 * 5 表へ書き込むときは対応する products.id も埋める必要がある。ここは**その
 * 書き込みの橋 1 回だけ** — 読み取り・突合・業務判定は一切ここを通らない
 * （すべて items 側。表示は `item` / `productItem` リレーションを読む）。
 *
 * `products.item_id` は unique なので対応は必ず 1:1。品目が
 * `searchProductItemOptions`（`itemType: "PRODUCT"`）由来である限り、対応する
 * products 行が無いことはない（items は products/materials から作られた鏡 —
 * items.prisma 冒頭コメント）。
 */

import { prisma } from "./db";

/** 品目 id（複数） → 対応する products.id のマップ。無い id は含まれない。 */
export async function legacyProductIdsForItems(
  itemIds: readonly number[],
): Promise<Map<number, number>> {
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) return new Map();
  const rows = await prisma.product.findMany({
    where: { itemId: { in: ids } },
    select: { id: true, itemId: true },
  });
  return new Map(rows.map((r) => [r.itemId as number, r.id]));
}

/** 品目 id 1 件 → 対応する products.id。対応が無ければ null。 */
export async function legacyProductIdForItem(
  itemId: number,
): Promise<number | null> {
  const row = await prisma.product.findFirst({
    where: { itemId },
    select: { id: true },
  });
  return row?.id ?? null;
}

/** products.id 1 件 → 対応する items.id。対応が無ければ null。 */
export async function itemIdForLegacyProduct(
  productId: number,
): Promise<number | null> {
  const row = await prisma.product.findUnique({
    where: { id: productId },
    select: { itemId: true },
  });
  return row?.itemId ?? null;
}

/** products.id（複数） → 対応する items.id のマップ。無い id は含まれない。 */
export async function itemIdsForLegacyProducts(
  productIds: readonly number[],
): Promise<Map<number, number>> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return new Map();
  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, itemId: true },
  });
  return new Map(
    rows.filter((r) => r.itemId != null).map((r) => [r.id, r.itemId as number]),
  );
}
