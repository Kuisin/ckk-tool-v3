import { notFound } from "next/navigation";
import {
  MaterialTypeDetail,
  type MaterialTypeDetailData,
} from "@/components/master/material-types/MaterialTypeDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 材種 詳細 (MS24). */
export default async function MasterMaterialTypesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [r, auditEntries] = await Promise.all([
    prisma.materialType.findUnique({
      where: { id },
      include: {
        manufacturer: true,
        grade: true,
        shape: true,
        materials: { orderBy: { id: "asc" } },
      },
    }),
    fetchAuditEntries("material_types", id),
  ]);
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  const description = r.description as LocalizedText | null;

  const record: MaterialTypeDetailData = {
    id: r.id,
    composition:
      r.manufacturerCode && r.kindCode
        ? {
            manufacturerLabel: `${r.manufacturerCode} — ${localized(
              r.manufacturer?.name as LocalizedText | null,
            )}`,
            gradeLabel: `${r.gradeCode} — ${localized(
              r.grade?.name as LocalizedText | null,
            )}`,
            shapeLabel: `${r.shapeCode} — ${localized(
              r.shape?.name as LocalizedText | null,
            )}`,
            kindCode: r.kindCode,
          }
        : null,
    nameJa: name?.ja ?? "",
    nameEn: name?.en ?? "",
    descriptionJa: description?.ja ?? "",
    descriptionEn: description?.en ?? "",
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    materials: r.materials.map((m) => ({
      id: m.id,
      name: localized(m.name as LocalizedText | null),
      size: `φ${Number(m.diameterMm)}×${Number(m.lengthMm)}mm`,
      unit: m.unit,
      isActive: m.isActive,
    })),
  };

  return <MaterialTypeDetail auditEntries={auditEntries} record={record} />;
}
