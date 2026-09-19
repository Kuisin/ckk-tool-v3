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

import { type Prisma, prisma } from "./db";

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

/** materials.id（複数） → 対応する items.id のマップ。無い id は含まれない。 */
export async function itemIdsForLegacyMaterials(
  materialIds: readonly number[],
): Promise<Map<number, number>> {
  const ids = [...new Set(materialIds)];
  if (ids.length === 0) return new Map();
  const rows = await prisma.material.findMany({
    where: { id: { in: ids } },
    select: { id: true, itemId: true },
  });
  return new Map(
    rows.filter((r) => r.itemId != null).map((r) => [r.id, r.itemId as number]),
  );
}

/** materials.id 1 件 → 対応する items.id。対応が無ければ null。 */
export async function itemIdForLegacyMaterial(
  materialId: number,
): Promise<number | null> {
  const row = await prisma.material.findUnique({
    where: { id: materialId },
    select: { itemId: true },
  });
  return row?.itemId ?? null;
}

// ─── 書き戻し（品目 → 旧 materials 行）───────────────────────────────────────
//
// 品目統合 第 3 段。素材マスタ (MS06) は **app.items が本体**になり、旧
// materials 行は同じ内容で追随するだけになった。順序は必ず
// **items → materials** — materials には `sync_item_from_material()` の BEFORE
// トリガーが張ってあり、materials を書くと items をその内容で上書きするため
// （20261024090000_items_master）。逆順にすると items へ書いた内容が
// 古い materials の値で潰される。
//
// 旧マスタを落とす PR では、この節と呼び出し 1 行ずつを消せば終わる。

/**
 * 旧 materials 行へ写す内容。**素材側の `materialTypeId` / `diameterMm` /
 * `lengthMm` は「その素材が何であるか」の実寸**で、製品側の同名の列
 * （要求寸法 = items.requires*）とは意味が逆（items.prisma 冒頭の注意）。
 */
export interface LegacyMaterialMirror {
  code: string;
  materialTypeId: number;
  surfaceFinishCode: string;
  diameterCode: string;
  lengthVariantCode: string;
  kindCode: string;
  diameterMm: number;
  lengthMm: number;
  manufacturerModel: string | null;
  nominalDiameterMm: number | null;
  name: Prisma.InputJsonValue;
  unit: string;
  matchNames: string[];
  isActive: boolean;
  notes: string | null;
}

/** 作成後に変えられない識別（コード構成）を除いた、編集できる属性だけ。 */
export type LegacyMaterialAttrs = Pick<
  LegacyMaterialMirror,
  | "name"
  | "unit"
  | "manufacturerModel"
  | "nominalDiameterMm"
  | "matchNames"
  | "isActive"
  | "notes"
>;

type MaterialWriter = Pick<typeof prisma, "material">;

/** 新しい品目に対応する旧 materials 行を作る。戻り値は materials.id。 */
export async function createLegacyMaterialForItem(
  tx: MaterialWriter,
  itemId: number,
  v: LegacyMaterialMirror,
): Promise<number> {
  const row = await tx.material.create({
    data: { itemId, ...v },
    select: { id: true },
  });
  return row.id;
}

/**
 * 品目の内容を旧 materials 行へ写す。対応が無ければ何もせず null。
 * **コード構成（材種・黒皮研磨・径・全長・種類）は写さない** — 作成後不変で、
 * 編集画面は値を持っていない。
 */
export async function updateLegacyMaterialForItem(
  tx: MaterialWriter,
  itemId: number,
  v: LegacyMaterialAttrs,
): Promise<number | null> {
  const row = await tx.material.findFirst({
    where: { itemId },
    select: { id: true },
  });
  if (!row) return null;
  await tx.material.update({ where: { id: row.id }, data: v });
  return row.id;
}
