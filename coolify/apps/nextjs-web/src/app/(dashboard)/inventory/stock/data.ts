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

// 一覧クエリの取得上限。在庫バケットは 品目 × 拠点 × 保管場所 × 棚 × ロットの
// 掛け算で伸びるので、この画面はどの一覧より早く上限に当たる。
//
// **だから絞り込みはサーバーでかける。** 上限を当ててからクライアントで絞ると、
// 「更新日の新しい順で 1000 件」を切り出したあとの絞り込みになり、動きの少ない
// 拠点を選ぶと**何も出ない**（在庫はあるのに）。この画面は「この棚に何があるか」
// を答えるためのものなので、それは黙った嘘になる。
const LIST_FETCH_CAP = 1000;

export interface StockOverviewFilter {
  plantId?: number | null;
  storageLocationId?: number | null;
  itemType?: "PRODUCT" | "MATERIAL" | null;
  /** 品目名・コードの部分一致。 */
  search?: string | null;
  /** 在庫ゼロ（手持ちも予約も 0）のバケットを隠すか。 */
  hideZero?: boolean;
  /** 預け先で絞る（null = 自社のみ / undefined = 絞らない）。 */
  custodyBpId?: string | null;
}

const ITEM_INVENTORY_INCLUDE = {
  item: true,
  plant: true,
  storageLocation: true,
  shelf: true,
  custodyBp: true,
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
    plantName: r.plant ? localized(r.plant.name as LocalizedText | null) : null,
    storageLocationId: r.storageLocationId,
    storageLocationName: r.storageLocation
      ? localized(r.storageLocation.name as LocalizedText | null)
      : null,
    shelfId: r.shelfId,
    shelfCode: r.shelf?.code ?? null,
    custodyBpId: r.custodyBpId,
    custodyBpName: r.custodyBp
      ? localized(r.custodyBp.name as LocalizedText | null)
      : null,
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

/**
 * 一覧 (ST02)。スコープ（RBAC）: 拠点。
 *
 * 並びは **拠点 → 保管場所 → 棚 → 品目**。倉庫を歩く順で読めるようにするため
 * （更新日順だと「同じ棚のもの」が散らばって、この画面の用途に合わない）。
 */
export async function fetchStockOverview(
  filter: StockOverviewFilter = {},
): Promise<StockOverviewListResult> {
  const authz = await checkPermission("inventory", "READ");
  if (!authz.ok) return { rows: [], truncated: false };

  const scope = plantWhere(
    authz.access,
    "plantId",
  ) as Prisma.ItemInventoryWhereInput;

  const q = filter.search?.trim();
  const where: Prisma.ItemInventoryWhereInput = {
    AND: [
      scope,
      ...(filter.plantId != null ? [{ plantId: filter.plantId }] : []),
      ...(filter.storageLocationId != null
        ? [{ storageLocationId: filter.storageLocationId }]
        : []),
      ...(filter.itemType ? [{ item: { itemType: filter.itemType } }] : []),
      ...(filter.custodyBpId !== undefined
        ? [{ custodyBpId: filter.custodyBpId }]
        : []),
      // 在庫ゼロを隠す = 手持ちも予約も 0 の行を外す（予約だけ残っている行は
      // 「引当済みで出ていない」なので、隠すと追えなくなる）。
      ...(filter.hideZero
        ? [{ OR: [{ quantity: { not: 0 } }, { reservedQuantity: { not: 0 } }] }]
        : []),
      ...(q
        ? [
            {
              OR: [
                {
                  item: { code: { contains: q, mode: "insensitive" as const } },
                },
                {
                  item: {
                    name: {
                      path: ["ja"],
                      string_contains: q,
                    },
                  },
                },
              ],
            },
          ]
        : []),
    ],
  };

  // custody-scope: **ここだけは預け分も読む。** この画面は「外注先がいま何を
  // 持っているか」に答える唯一の場所で、絞り込み（既定は自社）は画面側が
  // 持っている。行は預け先を名乗って出てくる（custodyBpName）ので、自社の
  // 在庫と混ざって見えることはない。
  const rows = await prisma.itemInventory.findMany({
    take: LIST_FETCH_CAP,
    where,
    include: ITEM_INVENTORY_INCLUDE,
    orderBy: [
      { plantId: "asc" },
      { storageLocationId: "asc" },
      { shelfId: "asc" },
      { itemId: "asc" },
      { lotNumber: "asc" },
    ],
  });
  return {
    rows: rows.map(mapRow),
    truncated: rows.length === LIST_FETCH_CAP,
  };
}
