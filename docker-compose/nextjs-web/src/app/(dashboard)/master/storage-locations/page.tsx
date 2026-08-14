import type { PlantFloorMapRef } from "@/components/master/plants/FloorMapsPanel";
import {
  type StorageLocationListRow,
  StorageLocationsApp,
} from "@/components/master/storage-locations/StorageLocationsApp";
import type { StorageLocationRow } from "@/components/master/storage-locations/StorageLocationsPanel";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 選択拠点の保管場所 + 棚（表示順 → コード順）— 管理パネル用。 */
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

/** 選択拠点のフロアマップ（端末管理 SY09 と共用の図面）。 */
async function fetchPlantFloorMaps(
  plantId: number,
): Promise<PlantFloorMapRef[]> {
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

/** 保管場所 一覧・管理 (MS0E) — 全拠点横断一覧 + 拠点選択で管理パネル。 */
export default async function MasterStorageLocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ plant?: string }>;
}) {
  const denied = await requireAppRead("master-storage-locations");
  if (denied) return denied;
  const { plant } = await searchParams;
  const plantIdParam = Number(plant);
  const plantId =
    Number.isInteger(plantIdParam) && plantIdParam > 0 ? plantIdParam : null;

  const [plants, allLocations] = await Promise.all([
    prisma.plant.findMany({
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, isActive: true },
    }),
    prisma.storageLocation.findMany({
      include: {
        plant: { select: { id: true, code: true, name: true } },
        _count: { select: { shelves: true } },
      },
      orderBy: [{ plantId: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
    }),
  ]);

  // 選択拠点が実在するときのみ管理パネル用データを取得
  const selectedPlant =
    plantId != null ? (plants.find((p) => p.id === plantId) ?? null) : null;
  const selected = selectedPlant
    ? {
        plantId: selectedPlant.id,
        locations: await fetchStorageLocations(selectedPlant.id),
        floorMaps: await fetchPlantFloorMaps(selectedPlant.id),
      }
    : null;

  const rows: StorageLocationListRow[] = allLocations.map((r) => {
    const name = r.name as LocalizedText | null;
    return {
      id: r.id,
      plantId: r.plant.id,
      plantCode: r.plant.code,
      plantName: localized(r.plant.name as LocalizedText | null),
      code: r.code,
      nameJa: name?.ja ?? "",
      shelfCount: r._count.shelves,
      placed: r.floorMapId != null,
      isActive: r.isActive,
    };
  });

  return (
    <StorageLocationsApp
      plantOptions={plants.map((p) => ({
        value: String(p.id),
        label: `${localized(p.name as LocalizedText | null)}（${p.code}）`,
      }))}
      rows={rows}
      selected={selected}
    />
  );
}
