/**
 * data.ts — 在庫一覧 (ST02) のサーバーサイド取得・マッピング。
 *
 * app.item_inventory は 製品在庫 (product_inventory) / 素材在庫
 * (material_inventory) を統合した鏡テーブル（inventory.prisma 冒頭コメント参照。
 * A-1 段階 = トリガーで同期。書き込みの持ち主は旧 2 表のまま）。**品目種別で
 * 取得を分岐しない** のがこの統合の意味そのもの — 1 回の findMany で全件を
 * 読む。
 *
 * Decimal（quantity / reservedQuantity）はここで Number() へ変換してから
 * クライアントへ渡す。
 */

import { plantWhere } from "@ckk/authz-core";
import type { StockOverviewRow } from "@/components/inventory/stock/model";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export { fetchPlantOptions } from "../../production/work-orders/data";
export {
  fetchStorageLocationOptions,
  type StorageLocationOption,
} from "../stock-takes/data";

// 一覧クエリの取得上限（入出庫伝票 PD07 / movements/data.ts と同じ方針 —
// DataTable はクライアントページング）。在庫バケットは品目 × 拠点 × 保管場所 ×
// 棚 × ロットの掛け算で伸びるので、ここも黙って切らず truncated を返す。
const LIST_FETCH_CAP = 1000;

const ITEM_INVENTORY_INCLUDE = {
  item: true,
  plant: true,
  storageLocation: true,
  shelf: true,
} satisfies Prisma.ItemInventoryInclude;

type ItemInventoryDbRow = Prisma.ItemInventoryGetPayload<{
  include: typeof ITEM_INVENTORY_INCLUDE;
}>;

function mapRow(r: ItemInventoryDbRow): StockOverviewRow {
  const quantity = Number(r.quantity);
  const reservedQuantity = Number(r.reservedQuantity);
  return {
    id: r.id,
    itemId: r.itemId,
    itemType: r.item.itemType,
    itemName: localized(r.item.name as LocalizedText | null),
    itemCode: r.item.code,
    plantId: r.plantId,
    plantName: r.plant
      ? localized(r.plant.name as LocalizedText | null)
      : null,
    storageLocationId: r.storageLocationId,
    storageLocationName: r.storageLocation
      ? localized(r.storageLocation.name as LocalizedText | null)
      : null,
    shelfId: r.shelfId,
    shelfCode: r.shelf?.code ?? null,
    lotNumber: r.lotNumber,
    quantity,
    reservedQuantity,
    available: quantity - reservedQuantity,
    unit: r.unit,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export interface StockOverviewListResult {
  rows: StockOverviewRow[];
  /** 取得上限で切れたか（= まだ他のバケットがある）。 */
  truncated: boolean;
}

/** 一覧 (ST02) — 更新日の新しい順。スコープ（RBAC）: 拠点。 */
export async function fetchStockOverview(): Promise<StockOverviewListResult> {
  const authz = await checkPermission("inventory", "READ");
  if (!authz.ok) return { rows: [], truncated: false };
  const rows = await prisma.itemInventory.findMany({
    take: LIST_FETCH_CAP,
    where: plantWhere(authz.access, "plantId") as Prisma.ItemInventoryWhereInput,
    include: ITEM_INVENTORY_INCLUDE,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  return {
    rows: rows.map(mapRow),
    truncated: rows.length === LIST_FETCH_CAP,
  };
}
