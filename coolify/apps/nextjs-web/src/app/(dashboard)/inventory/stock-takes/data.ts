/**
 * data.ts — 棚卸 (PD08) のサーバーサイド取得・マッピング。
 *
 * - 一覧: stock_takes（更新日の新しい順、拠点スコープ）。
 * - 詳細: 棚卸行 + 対象バケット（product_inventory / material_inventory を
 *   inventoryType/inventoryId で多態解決）。Decimal はここで Number() へ
 *   変換してからクライアントへ渡す。
 * - 氏名（作成者・依頼者・承認者・…）は StockTake に FK リレーションを
 *   持たせていないため、対象 id を集めて 1 回のクエリで解決する。
 */

import { plantWhere, rowInScope } from "@ckk/authz-core";
import type {
  StockTakeLineView,
  StockTakeRow,
  StockTakeView,
} from "@/components/inventory/stock-takes/model";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import {
  formatDocNumber,
  formatMovementNumber,
  parseDocKey,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { storageLabelOf } from "../products/data";

/** 拠点（有効のみ）— 新規登録の拠点 Select。value = String(内部 id)。 */
export { fetchPlantOptions } from "../../production/work-orders/data";

const plantName = (f: { name: unknown } | null) =>
  f ? localized(f.name as LocalizedText | null) : null;

export interface StorageLocationOption {
  value: string;
  label: string;
  plantId: number;
}

/** 保管場所（有効のみ・拠点 id 付き）— 新規登録の 2 段階 Select（拠点 → 保管場所）用。 */
export async function fetchStorageLocationOptions(): Promise<
  StorageLocationOption[]
> {
  const rows = await prisma.storageLocation.findMany({
    where: { isActive: true, plant: { isActive: true } },
    orderBy: [{ plantId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
  return rows.map((r) => ({
    value: String(r.id),
    label: localized(r.name as LocalizedText | null),
    plantId: r.plantId,
  }));
}

/** 対象の氏名を集めて解決する（StockTake は行為者へ FK リレーションを持たない）。 */
async function resolveUserNames(
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const rows = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, displayName: true },
  });
  return new Map(rows.map((r) => [r.id, r.displayName]));
}

/** 一覧（更新日の新しい順・拠点スコープ）。 */
export async function fetchStockTakes(): Promise<StockTakeRow[]> {
  const authz = await checkPermission("inventory", "READ");
  if (!authz.ok) return [];
  const rows = await prisma.stockTake.findMany({
    where: plantWhere(authz.access, "plantId") as Prisma.StockTakeWhereInput,
    include: {
      plant: true,
      storageLocation: true,
      _count: { select: { lines: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const names = await resolveUserNames(rows.map((r) => r.createdBy));
  return rows.map((r) => ({
    stockTakeNumber: formatDocNumber("STK", {
      yearMonth: r.yearMonth,
      seq: r.seq,
    }),
    plantName: plantName(r.plant) ?? "—",
    storageLocationName: r.storageLocation
      ? localized(r.storageLocation.name as LocalizedText | null)
      : null,
    status: r.status,
    approvalStatus: r.approvalStatus,
    lineCount: r._count.lines,
    createdByName: r.createdBy ? (names.get(r.createdBy) ?? null) : null,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

type StockTakeLineRow = Prisma.StockTakeLineGetPayload<Record<string, never>>;

/** 対象バケット（在庫行）を表示形へ解決する。多態参照なので一括で引く。 */
async function resolveLines(
  lines: StockTakeLineRow[],
): Promise<StockTakeLineView[]> {
  // 在庫は 1 表（app.item_inventory）。棚卸の明細は品目種別を持つが、
  // バケットを引くのに種別で分ける必要はもう無い。
  const bucketIds = [...new Set(lines.map((l) => l.inventoryId))];
  const buckets = bucketIds.length
    ? await prisma.itemInventory.findMany({
        where: { id: { in: bucketIds } },
        include: { item: true, storageLocation: true, shelf: true },
      })
    : [];
  const bucketMap = new Map(buckets.map((b) => [b.id, b]));

  return lines
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((l) => {
      const b = bucketMap.get(l.inventoryId);
      return {
        id: l.id,
        inventoryType: l.inventoryType,
        itemName: b ? localized(b.item.name as LocalizedText | null) : "—",
        itemCode: b?.item.code ?? null,
        storageLabel: b ? storageLabelOf(b) : null,
        lotNumber: b?.lotNumber ?? null,
        bookQuantity: Number(l.bookQuantity),
        countedQuantity:
          l.countedQuantity != null ? Number(l.countedQuantity) : null,
        notes: l.notes,
      };
    });
}

/** 棚卸 詳細（id = 表示番号 STK-YYYYMM-NNNNN）。未存在・スコープ外は null。 */
export async function fetchStockTake(
  stockTakeNumber: string,
): Promise<StockTakeView | null> {
  const authz = await checkPermission("inventory", "READ");
  if (!authz.ok) return null;
  const key = parseDocKey(stockTakeNumber, "STK");
  if (!key) return null;
  const r = await prisma.stockTake.findUnique({
    where: { yearMonth_seq: key },
    include: {
      plant: true,
      storageLocation: true,
      lines: true,
    },
  });
  if (!r) return null;
  if (!rowInScope(authz.access, { plantIds: [r.plantId] }, authz.userId)) {
    return null;
  }

  const [names, lines, movement] = await Promise.all([
    resolveUserNames([
      r.createdBy,
      r.requestedBy,
      r.rejectedBy,
      r.confirmedBy,
      r.cancelledBy,
    ]),
    resolveLines(r.lines),
    r.movementId
      ? prisma.inventoryMovement.findUnique({
          where: { id: r.movementId },
          select: { yearMonth: true, seq: true },
        })
      : null,
  ]);

  return {
    stockTakeNumber: formatDocNumber("STK", {
      yearMonth: r.yearMonth,
      seq: r.seq,
    }),
    plantId: r.plantId,
    plantName: plantName(r.plant) ?? "—",
    storageLocationId: r.storageLocationId,
    storageLocationName: r.storageLocation
      ? localized(r.storageLocation.name as LocalizedText | null)
      : null,
    status: r.status,
    approvalStatus: r.approvalStatus,
    countedAt: r.countedAt?.toISOString() ?? null,
    requestedAt: r.requestedAt?.toISOString() ?? null,
    requestedByName: r.requestedBy ? (names.get(r.requestedBy) ?? null) : null,
    rejectedAt: r.rejectedAt?.toISOString() ?? null,
    rejectedByName: r.rejectedBy ? (names.get(r.rejectedBy) ?? null) : null,
    rejectReason: r.rejectReason,
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
    confirmedByName: r.confirmedBy ? (names.get(r.confirmedBy) ?? null) : null,
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    cancelledByName: r.cancelledBy ? (names.get(r.cancelledBy) ?? null) : null,
    movementNumber: movement ? formatMovementNumber(movement) : null,
    notes: r.notes,
    createdByName: r.createdBy ? (names.get(r.createdBy) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    lines,
  };
}
