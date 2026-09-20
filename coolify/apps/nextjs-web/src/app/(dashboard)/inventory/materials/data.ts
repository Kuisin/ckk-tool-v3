/**
 * data.ts — 素材在庫 (PD05) のサーバーサイド取得・マッピング。
 *
 * - 一覧: item_inventory + 次回入荷（ORDERED 発注明細の直近 expected_at。
 *   lib/atp.ts materialAtp の nextReceiptDate と同じ規則を品目単位で一括算出 —
 *   行ごとの ATP 呼び出しを避ける）。
 * - 詳細: 在庫行 + materialAtp タイムライン + 取引履歴。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 *
 * 品目統合 第 2 段 B — 発注明細（material_purchase_order_items）が item_id を
 * 持つようになったので、以前あった「品目 → 素材の対応をまとめて引く」往復は
 * 不要になった（item_inventory の itemId をそのまま発注明細の絞り込みに使える）。
 */

import { plantWhere, rowInScope } from "@ckk/authz-core";
import type {
  MaterialInventoryDetailData,
  MaterialInventoryRow,
} from "@/components/inventory/materials/model";
import { materialAtp } from "@/lib/atp";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { storageLabelOf } from "../products/data";
import { fetchInventoryTransactions } from "../shared";

const plantName = (f: { name: unknown } | null) =>
  f ? localized(f.name as LocalizedText | null) : null;

/** 素材在庫 一覧（更新日の新しい順）。 */
export async function fetchMaterialInventories(): Promise<
  MaterialInventoryRow[]
> {
  // スコープ行フィルタ（PLANT = 保管拠点。ALL は {} で従来通り全件）。
  const authz = await checkPermission("inventory", "READ");
  if (!authz.ok) return [];
  // 在庫は 1 表（app.item_inventory）。この画面は素材タブなので品目種別で絞る。
  const rows = await prisma.itemInventory.findMany({
    where: {
      ...(plantWhere(
        authz.access,
        "plantId",
      ) as Prisma.ItemInventoryWhereInput),
      item: { itemType: "MATERIAL" },
      // 自社の在庫だけ（外注へ預けている分は手持ちではない）。
      custodyBpId: null,
    },
    include: { item: true, plant: true, storageLocation: true, shelf: true },
    orderBy: { updatedAt: "desc" },
  });

  // 次回入荷（品目単位、全拠点合算 — materialAtp() と同じ規則）を一括算出:
  // ORDERED 発注明細のうち expected_at のある直近日。
  const itemIds = [...new Set(rows.map((r) => r.itemId))];
  const orderedItems = itemIds.length
    ? await prisma.materialPurchaseOrderItem.findMany({
        where: {
          itemId: { in: itemIds },
          expectedAt: { not: null },
          purchaseOrder: { status: "ORDERED" },
        },
        select: { itemId: true, expectedAt: true },
      })
    : [];
  const nextReceipt = new Map<number, string>();
  for (const it of orderedItems) {
    if (it.itemId == null) continue;
    const date = it.expectedAt?.toISOString().slice(0, 10);
    if (!date) continue;
    const cur = nextReceipt.get(it.itemId);
    if (!cur || date < cur) nextReceipt.set(it.itemId, date);
  }

  return rows.map((r) => {
    const quantity = Number(r.quantity);
    const reservedQuantity = Number(r.reservedQuantity);
    return {
      id: r.id,
      materialCode: r.item.code ?? "",
      materialName: localized(r.item.name as LocalizedText | null),
      plantId: r.plantId,
      plantName: plantName(r.plant),
      storageLocationId: r.storageLocationId,
      storageLocationName: r.storageLocation
        ? localized(r.storageLocation.name as LocalizedText | null)
        : null,
      shelfId: r.shelfId,
      shelfCode: r.shelf?.code ?? null,
      quantity,
      reservedQuantity,
      available: quantity - reservedQuantity,
      unit: r.unit,
      nextReceiptDate: nextReceipt.get(r.itemId) ?? null,
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

/** 素材在庫 詳細（id = material_inventory.id uuid）。未存在は null。 */
export async function fetchMaterialInventoryDetail(
  id: string,
): Promise<MaterialInventoryDetailData | null> {
  const authz = await checkPermission("inventory", "READ");
  if (!authz.ok) return null;
  const r = await prisma.itemInventory.findUnique({
    where: { id },
    include: { item: true, plant: true, storageLocation: true, shelf: true },
  });
  if (!r) return null;
  // スコープ外の行は不可視（null → 呼び出し側の notFound に乗せる）。
  if (!rowInScope(authz.access, { plantIds: [r.plantId] }, authz.userId)) {
    return null;
  }

  const [atp, transactions] = await Promise.all([
    // 拠点が設定された在庫行はその拠点の ATP、未設定行は全拠点合算。
    materialAtp(r.itemId, r.plantId),
    fetchInventoryTransactions("MATERIAL", r.id),
  ]);

  const quantity = Number(r.quantity);
  const reservedQuantity = Number(r.reservedQuantity);

  return {
    id: r.id,
    materialCode: r.item.code ?? "",
    materialName: localized(r.item.name as LocalizedText | null),
    plantName: plantName(r.plant),
    quantity,
    reservedQuantity,
    available: quantity - reservedQuantity,
    unit: r.unit,
    storageLabel: storageLabelOf(r),
    location: r.location,
    notes: r.notes,
    updatedAt: r.updatedAt.toISOString(),
    atp: {
      onHand: atp.onHand,
      reserved: atp.reserved,
      availableNow: atp.availableNow,
      nextReceiptDate: atp.nextReceiptDate,
      timeline: atp.timeline,
    },
    transactions,
  };
}
