import { notFound } from "next/navigation";
import {
  PlantDetail,
  type PlantDetailData,
  type PlantInventorySummary,
} from "@/components/master/plants/PlantDetail";
import type { StorageLocationRow } from "@/components/master/plants/StorageLocationsPanel";
import { fetchAuditEntries } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { formatProductNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

/** 保管場所タブ用 — 拠点の保管場所 + 棚（表示順 → コード順）。 */
async function fetchStorageLocations(
  plantId: number,
): Promise<StorageLocationRow[]> {
  const rows = await prisma.storageLocation.findMany({
    where: { plantId },
    include: {
      shelves: { orderBy: [{ sortOrder: "asc" }, { code: "asc" }] },
    },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  return rows.map((r) => {
    const name = r.name as LocalizedText | null;
    return {
      id: r.id,
      code: r.code,
      nameJa: name?.ja ?? "",
      nameEn: name?.en ?? "",
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      notes: r.notes ?? "",
      floorMapId: r.floorMapId,
      mapX: r.mapX != null ? Number(r.mapX) : null,
      mapY: r.mapY != null ? Number(r.mapY) : null,
      shelves: r.shelves.map((s) => {
        const sname = s.name as LocalizedText | null;
        return {
          id: s.id,
          code: s.code,
          nameJa: sname?.ja ?? "",
          nameEn: sname?.en ?? "",
          sortOrder: s.sortOrder,
          isActive: s.isActive,
        };
      }),
    };
  });
}

/** 保管場所タブ用 — 拠点のフロアマップ（端末管理 SY09 と共用の図面）。 */
async function fetchPlantFloorMaps(plantId: number) {
  const maps = await prisma.kioskFloorMap.findMany({
    where: { plantId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, fileId: true },
  });
  return maps.map((m) => ({
    id: m.id,
    name: m.name,
    hasImage: m.fileId != null,
  }));
}

export const dynamic = "force-dynamic";

/** 関連タブの在庫サマリ — 件数 + 更新日の新しい順 上位 10 行。 */
async function fetchInventorySummary(
  plantId: number,
): Promise<PlantInventorySummary> {
  const [productCount, materialCount, products, materials] = await Promise.all([
    prisma.productInventory.count({ where: { plantId } }),
    prisma.materialInventory.count({ where: { plantId } }),
    prisma.productInventory.findMany({
      where: { plantId },
      include: { product: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.materialInventory.findMany({
      where: { plantId },
      include: { material: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);
  return {
    productCount,
    materialCount,
    products: products.map((r) => ({
      id: r.id,
      productName: localized(r.product.name as LocalizedText | null),
      productCode: formatProductNumber(r.product.yearMonth, r.product.seq),
      lotNumber: r.lotNumber,
      quantity: r.quantity,
      reservedQuantity: r.reservedQuantity,
      isSemiFinished: r.isSemiFinished,
      updatedAt: r.updatedAt.toISOString(),
    })),
    materials: materials.map((r) => ({
      id: r.id,
      materialCode: r.material.code,
      materialName: localized(r.material.name as LocalizedText | null),
      // Decimal → Number（境界で変換）
      quantity: Number(r.quantity),
      reservedQuantity: Number(r.reservedQuantity),
      unit: r.unit,
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}

/** 拠点 詳細 (MS2B). */
export default async function MasterPlantsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const [r, auditEntries, inventory, storageLocations, floorMaps] =
    await Promise.all([
      prisma.plant.findUnique({ where: { id } }),
      fetchAuditEntries("plants", String(id)),
      fetchInventorySummary(id),
      fetchStorageLocations(id),
      fetchPlantFloorMaps(id),
    ]);
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  const address = r.address as LocalizedText | null;

  const record: PlantDetailData = {
    id: r.id,
    code: r.code,
    nameJa: name?.ja ?? "",
    nameEn: name?.en ?? "",
    nameKana: r.nameKana ?? "",
    countryCode: r.countryCode,
    postalCode: r.postalCode ?? "",
    addressJa: address?.ja ?? "",
    addressEn: address?.en ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    contactPerson: r.contactPerson ?? "",
    isActive: r.isActive,
    notes: r.notes ?? "",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };

  return (
    <PlantDetail
      auditEntries={auditEntries}
      floorMaps={floorMaps}
      inventory={inventory}
      record={record}
      storageLocations={storageLocations}
    />
  );
}
