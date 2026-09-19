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

import { type Prisma, prisma } from "./db";

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

// ─── 書き戻し（品目 → 旧 products 行）─────────────────────────────────────────
//
// 品目統合 第 3 段。製品マスタ (MS04) は **app.items が本体**になり、旧
// products 行は「まだ落としていない参照先」として同じ内容で追随するだけになった。
// 順序は必ず **items → products**:
//
//   products には `sync_item_from_product()` の BEFORE トリガーが張ってあり、
//   products を書くと **items をその内容で上書きする**（20261024090000_items_master）。
//   同じ値を写している限り結果は同じだが、逆順（products → items）にすると
//   「items へ書いた内容をトリガーが古い products の値で潰す」形になり、
//   どちらが勝ったのか読めなくなる。
//
// 旧マスタを落とす PR では、この節と呼び出し 1 行ずつを消せば終わる。

/**
 * 旧 products 行へ写す内容。列名は **items 側の意味**で受け取る
 * （`requires*` = その製品が要求する素材）。products の
 * `material_type_id` / `diameter_mm` / `length_mm` は**素材マスタの同名列とは
 * 逆の意味**なので、呼び出し側が products の名前で組み立てられるようにすると
 * 取り違えても型が通ってしまう（items.prisma 冒頭の注意）。
 */
export interface LegacyProductMirror {
  yearMonth: string | null;
  seq: number | null;
  name: Prisma.InputJsonValue;
  requiresMaterialTypeId: number | null;
  requiresDiameterMm: number | null;
  requiresLengthMm: number | null;
  unit: string;
  taxCategoryId: number | null;
  matchNames: string[];
  spec: Prisma.InputJsonValue | typeof Prisma.DbNull;
  isActive: boolean;
  notes: string | null;
}

type ProductWriter = Pick<typeof prisma, "product">;

/** items 側の意味 → products の列名へ写す（採番列 yearMonth / seq を除く）。 */
function legacyProductAttrs(v: Omit<LegacyProductMirror, "yearMonth" | "seq">) {
  return {
    name: v.name,
    // ここが橋の要 — items の requires* が products の materialTypeId 等になる。
    materialTypeId: v.requiresMaterialTypeId,
    diameterMm: v.requiresDiameterMm,
    lengthMm: v.requiresLengthMm,
    unit: v.unit,
    taxCategoryId: v.taxCategoryId,
    matchNames: v.matchNames,
    spec: v.spec,
    isActive: v.isActive,
    notes: v.notes,
  };
}

/** 新しい品目に対応する旧 products 行を作る。戻り値は products.id。 */
export async function createLegacyProductForItem(
  tx: ProductWriter,
  itemId: number,
  v: LegacyProductMirror,
): Promise<number> {
  const { yearMonth, seq, ...attrs } = v;
  const row = await tx.product.create({
    data: { itemId, yearMonth, seq, ...legacyProductAttrs(attrs) },
    select: { id: true },
  });
  return row.id;
}

/**
 * 品目の内容を旧 products 行へ写す。対応が無ければ何もせず null。
 * **採番列（yearMonth / seq）は写さない** — 採番後不変で、編集画面は値を
 * 持っていないため、写すと採番が黙って消える。
 */
export async function updateLegacyProductForItem(
  tx: ProductWriter,
  itemId: number,
  v: Omit<LegacyProductMirror, "yearMonth" | "seq">,
): Promise<number | null> {
  const row = await tx.product.findFirst({
    where: { itemId },
    select: { id: true },
  });
  if (!row) return null;
  await tx.product.update({
    where: { id: row.id },
    data: legacyProductAttrs(v),
  });
  return row.id;
}
