/**
 * data.ts — 素材在庫 (PD05) のサーバーサイド取得・マッピング。
 *
 * - 一覧: material_inventory + 次回入荷（ORDERED 発注明細の直近 expected_at。
 *   lib/atp.ts materialAtp の nextReceiptDate と同じ規則を素材単位で一括算出 —
 *   行ごとの ATP 呼び出しを避ける）。
 * - 詳細: 在庫行 + materialAtp タイムライン + 取引履歴。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 */

import type {
  MaterialInventoryDetailData,
  MaterialInventoryRow,
} from "@/components/production/inventory/materials/model";
import { materialAtp } from "@/lib/atp";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { fetchInventoryTransactions } from "../shared";

const factoryName = (f: { name: unknown } | null) =>
  f ? localized(f.name as LocalizedText | null) : null;

/** 素材在庫 一覧（更新日の新しい順）。 */
export async function fetchMaterialInventories(): Promise<
  MaterialInventoryRow[]
> {
  const rows = await prisma.materialInventory.findMany({
    include: { material: true, factory: true },
    orderBy: { updatedAt: "desc" },
  });

  // 次回入荷（素材単位、全工場合算 — materialAtp() と同じ規則）を一括算出:
  // ORDERED 発注明細のうち expected_at のある直近日。
  const materialIds = [...new Set(rows.map((r) => r.materialId))];
  const orderedItems = materialIds.length
    ? await prisma.materialPurchaseOrderItem.findMany({
        where: {
          materialId: { in: materialIds },
          expectedAt: { not: null },
          purchaseOrder: { status: "ORDERED" },
        },
        select: { materialId: true, expectedAt: true },
      })
    : [];
  const nextReceipt = new Map<number, string>();
  for (const it of orderedItems) {
    const date = it.expectedAt?.toISOString().slice(0, 10);
    if (!date) continue;
    const cur = nextReceipt.get(it.materialId);
    if (!cur || date < cur) nextReceipt.set(it.materialId, date);
  }

  return rows.map((r) => {
    const quantity = Number(r.quantity);
    const reservedQuantity = Number(r.reservedQuantity);
    return {
      id: r.id,
      materialCode: r.material.code,
      materialName: localized(r.material.name as LocalizedText | null),
      factoryName: factoryName(r.factory),
      quantity,
      reservedQuantity,
      available: quantity - reservedQuantity,
      unit: r.unit,
      nextReceiptDate: nextReceipt.get(r.materialId) ?? null,
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

/** 素材在庫 詳細（id = material_inventory.id uuid）。未存在は null。 */
export async function fetchMaterialInventoryDetail(
  id: string,
): Promise<MaterialInventoryDetailData | null> {
  const r = await prisma.materialInventory.findUnique({
    where: { id },
    include: { material: true, factory: true },
  });
  if (!r) return null;

  const [atp, transactions] = await Promise.all([
    // 工場が設定された在庫行はその工場の ATP、未設定行は全工場合算。
    materialAtp(r.materialId, r.factoryId),
    fetchInventoryTransactions("MATERIAL", r.id),
  ]);

  const quantity = Number(r.quantity);
  const reservedQuantity = Number(r.reservedQuantity);

  return {
    id: r.id,
    materialCode: r.material.code,
    materialName: localized(r.material.name as LocalizedText | null),
    factoryName: factoryName(r.factory),
    quantity,
    reservedQuantity,
    available: quantity - reservedQuantity,
    unit: r.unit,
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
