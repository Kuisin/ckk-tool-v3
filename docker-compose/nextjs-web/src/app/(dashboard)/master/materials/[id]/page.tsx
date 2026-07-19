import { notFound } from "next/navigation";
import {
  MaterialDetail,
  type MaterialDetailData,
} from "@/components/master/materials/MaterialDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 素材 詳細 (MS25). */
export default async function MasterMaterialsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const [r, auditEntries] = await Promise.all([
    prisma.material.findUnique({
      where: { id },
      include: {
        materialType: true,
        surfaceFinish: true,
      },
    }),
    fetchAuditEntries("materials", String(id)),
  ]);
  if (!r) notFound();

  const name = r.name as LocalizedText | null;

  const record: MaterialDetailData = {
    id: r.id,
    code: r.code,
    materialTypeId: r.materialTypeId,
    materialTypeCode: r.materialType.code ?? "",
    materialTypeName: localized(r.materialType.name as LocalizedText | null),
    surfaceFinish: localized(r.surfaceFinish.name as LocalizedText | null),
    diameterMm: Number(r.diameterMm),
    lengthMm: Number(r.lengthMm),
    kindCode: r.kindCode,
    nominalDiameterMm:
      r.nominalDiameterMm != null ? Number(r.nominalDiameterMm) : null,
    manufacturerModel: r.manufacturerModel ?? "",
    defaultUnitPrice:
      r.defaultUnitPrice != null ? Number(r.defaultUnitPrice) : null,
    nameJa: name?.ja ?? "",
    nameEn: name?.en ?? "",
    unit: r.unit,
    isActive: r.isActive,
    notes: r.notes ?? "",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };

  return <MaterialDetail auditEntries={auditEntries} record={record} />;
}
