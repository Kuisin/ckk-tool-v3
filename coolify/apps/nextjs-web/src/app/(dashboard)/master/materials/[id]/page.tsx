import { notFound } from "next/navigation";
import {
  MaterialDetail,
  type MaterialDetailData,
} from "@/components/master/materials/MaterialDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * 素材 詳細 (MS26).
 *
 * URL の id は **items.id**（品目統合 第 3 段）。履歴だけは旧 materials.id で
 * 積まれているので、その 1 件のためだけに対応を引く（actions.ts の監査の節）。
 */
export default async function MasterMaterialsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-materials");
  if (denied) return denied;
  const { id: idParam } = await params;
  const itemId = Number(idParam);
  if (!Number.isInteger(itemId)) notFound();
  const [r, auditEntries, finishes] = await Promise.all([
    prisma.item.findFirst({
      where: { id: itemId, itemType: "MATERIAL" },
      include: { materialType: true },
    }),
    fetchAuditEntries("materials", String(itemId)),
    prisma.materialSurfaceFinish.findMany(),
  ]);
  if (!r) notFound();

  const name = r.name as LocalizedText | null;

  const surfaceFinish = finishes.find((f) => f.code === r.surfaceFinishCode);

  const record: MaterialDetailData = {
    id: r.id,
    code: r.code ?? "",
    materialTypeId: r.materialTypeId ?? 0,
    materialTypeCode: r.materialType?.code ?? "",
    materialTypeName: localized(r.materialType?.name as LocalizedText | null),
    surfaceFinish: localized(surfaceFinish?.name as LocalizedText | null),
    diameterMm: Number(r.diameterMm ?? 0),
    lengthMm: Number(r.lengthMm ?? 0),
    kindCode: r.kindCode ?? "",
    nominalDiameterMm:
      r.nominalDiameterMm != null ? Number(r.nominalDiameterMm) : null,
    manufacturerModel: r.manufacturerModel ?? "",
    nameJa: name?.ja ?? "",
    nameEn: name?.en ?? "",
    unit: r.unit,
    matchNames: r.matchNames,
    isActive: r.isActive,
    notes: r.notes ?? "",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };

  return <MaterialDetail auditEntries={auditEntries} record={record} />;
}
