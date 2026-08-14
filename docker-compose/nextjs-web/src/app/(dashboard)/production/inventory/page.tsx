import type { TransferPlantOption } from "@/components/production/inventory/StockTransferModal";
import { UnifiedInventory } from "@/components/production/inventory/UnifiedInventory";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { fetchMaterialInventories } from "./materials/data";
import { fetchProductInventories, fetchWipRows } from "./products/data";

export const dynamic = "force-dynamic";

/** 移動先・ロケーションビュー用: 有効な拠点 → 保管場所 → 棚。 */
async function fetchPlantStorageOptions(): Promise<TransferPlantOption[]> {
  const plants = await prisma.plant.findMany({
    where: { isActive: true },
    include: {
      storageLocations: {
        where: { isActive: true },
        include: {
          shelves: {
            where: { isActive: true },
            orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
          },
        },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      },
      kioskFloorMaps: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, fileId: true },
      },
    },
    orderBy: { code: "asc" },
  });
  return plants.map((f) => ({
    id: f.id,
    name: localized(f.name as LocalizedText | null),
    locations: f.storageLocations.map((l) => ({
      id: l.id,
      code: l.code,
      name: localized(l.name as LocalizedText | null),
      floorMapId: l.floorMapId,
      mapX: l.mapX != null ? Number(l.mapX) : null,
      mapY: l.mapY != null ? Number(l.mapY) : null,
      shelves: l.shelves.map((s) => {
        const name = s.name as LocalizedText | null;
        return { id: s.id, code: s.code, name: name?.ja || null };
      }),
    })),
    floorMaps: f.kioskFloorMaps.map((m) => ({
      id: m.id,
      name: m.name,
      hasImage: m.fileId != null,
    })),
  }));
}

/** 在庫管理 (PD04) — 製品・素材・仕掛品・ロケーションの統合ビュー。 */
export default async function UnifiedInventoryPage() {
  const denied = await requireAppRead("inventory");
  if (denied) return denied;
  const [productRows, materialRows, wipRows, plants] = await Promise.all([
    fetchProductInventories(),
    fetchMaterialInventories(),
    fetchWipRows(),
    fetchPlantStorageOptions(),
  ]);
  return (
    <UnifiedInventory
      materialRows={materialRows}
      plants={plants}
      productRows={productRows}
      wipRows={wipRows}
    />
  );
}
