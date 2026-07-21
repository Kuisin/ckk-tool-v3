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
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const [r, auditEntries, diameters, surfaces, priceRows] = await Promise.all([
    prisma.materialType.findUnique({
      where: { id },
      include: {
        manufacturer: true,
        grade: true,
        shape: true,
        materials: { orderBy: { code: "asc" } },
      },
    }),
    fetchAuditEntries("material_types", String(id)),
    prisma.materialDiameter.findMany({
      where: { isActive: true },
      orderBy: { diameterMm: "asc" },
    }),
    prisma.materialSurfaceFinish.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    }),
    prisma.materialTypePrice.findMany({ where: { materialTypeId: id } }),
  ]);
  if (!r) notFound();

  const diameterOptions = diameters.map((d) => ({
    value: d.code,
    label: `φ${Number(d.diameterMm)}`,
  }));
  const surfaceOptions = surfaces.map((s) => ({
    value: s.code,
    label: localized(s.name as LocalizedText | null),
  }));
  const prices = priceRows.map((p) => ({
    diameterCode: p.diameterCode,
    surfaceFinishCode: p.surfaceFinishCode,
    unitPrice: Number(p.unitPrice),
  }));

  const name = r.name as LocalizedText | null;
  const description = r.description as LocalizedText | null;

  const record: MaterialTypeDetailData = {
    id: r.id,
    code: r.code,
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
      code: m.code,
      name: localized(m.name as LocalizedText | null),
      size: `φ${Number(m.diameterMm)}×${Number(m.lengthMm)}mm`,
      unit: m.unit,
      isActive: m.isActive,
    })),
  };

  return (
    <MaterialTypeDetail
      auditEntries={auditEntries}
      diameterOptions={diameterOptions}
      prices={prices}
      record={record}
      surfaceOptions={surfaceOptions}
    />
  );
}
