import {
  type MaterialRow,
  MaterialTable,
} from "@/components/master/materials/MaterialTable";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 素材 一覧 (MS05). */
export default async function MasterMaterialsPage() {
  const records = await prisma.material.findMany({
    include: { materialType: true, surfaceFinish: true },
    orderBy: { code: "asc" },
  });

  const rows: MaterialRow[] = records.map((r) => ({
    id: r.id,
    code: r.code,
    materialTypeCode: r.materialType.code ?? "",
    materialTypeName: localized(r.materialType.name as LocalizedText | null),
    name: localized(r.name as LocalizedText | null),
    diameterMm: Number(r.diameterMm),
    lengthMm: Number(r.lengthMm),
    surfaceFinish: localized(r.surfaceFinish.name as LocalizedText | null),
    unit: r.unit,
    defaultUnitPrice: r.defaultUnitPrice ? Number(r.defaultUnitPrice) : null,
    isActive: r.isActive,
  }));

  return <MaterialTable rows={rows} />;
}
