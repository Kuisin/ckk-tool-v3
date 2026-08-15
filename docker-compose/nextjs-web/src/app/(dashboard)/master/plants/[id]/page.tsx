import { notFound } from "next/navigation";
import type { PlantFloorMapRef } from "@/components/master/plants/FloorMapsPanel";
import {
  PlantDetail,
  type PlantDetailData,
} from "@/components/master/plants/PlantDetail";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import type { LocalizedText } from "@/lib/format";

/** フロアマップタブ用 — 拠点のフロアマップ（端末管理 SY09 と共用の図面）。 */
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

export const dynamic = "force-dynamic";

/** 拠点 詳細 (MS2C). */
export default async function MasterPlantsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-plants");
  if (denied) return denied;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const [r, floorMaps] = await Promise.all([
    prisma.plant.findUnique({ where: { id } }),
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

  return <PlantDetail floorMaps={floorMaps} record={record} />;
}
