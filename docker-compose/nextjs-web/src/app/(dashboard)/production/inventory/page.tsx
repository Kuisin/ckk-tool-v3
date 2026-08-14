import type { TransferFactoryOption } from "@/components/production/inventory/StockTransferModal";
import { UnifiedInventory } from "@/components/production/inventory/UnifiedInventory";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { fetchMaterialInventories } from "./materials/data";
import { fetchProductInventories, fetchWipRows } from "./products/data";

export const dynamic = "force-dynamic";

/** 移動先・ロケーションビュー用: 有効な工場 → 保管場所 → 棚。 */
async function fetchFactoryStorageOptions(): Promise<TransferFactoryOption[]> {
  const factories = await prisma.factory.findMany({
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
  return factories.map((f) => ({
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
  const [productRows, materialRows, wipRows, factories] = await Promise.all([
    fetchProductInventories(),
    fetchMaterialInventories(),
    fetchWipRows(),
    fetchFactoryStorageOptions(),
  ]);
  return (
    <UnifiedInventory
      factories={factories}
      materialRows={materialRows}
      productRows={productRows}
      wipRows={wipRows}
    />
  );
}
