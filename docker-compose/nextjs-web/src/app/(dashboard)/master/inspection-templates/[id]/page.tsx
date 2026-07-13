import { notFound } from "next/navigation";
import {
  InspectionTemplateDetail,
  type InspectionTemplateDetailData,
} from "@/components/master/inspection-templates/InspectionTemplateDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 検査表テンプレート 詳細 (MS28). */
export default async function MasterInspectionTemplatesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const [r, auditEntries] = await Promise.all([
    prisma.inspectionTemplate.findUnique({
      where: { id },
      include: {
        relatedProcessStep: true,
        items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      },
    }),
    fetchAuditEntries("inspection_templates", String(id)),
  ]);
  if (!r) notFound();

  const name = r.name as LocalizedText | null;

  const record: InspectionTemplateDetailData = {
    id: r.id,
    code: r.code,
    nameJa: name?.ja ?? "",
    nameEn: name?.en ?? "",
    relatedProcessStep: r.relatedProcessStep
      ? localized(r.relatedProcessStep.name as LocalizedText | null)
      : "",
    isActive: r.isActive,
    items: r.items.map((item) => {
      const itemName = item.itemName as LocalizedText | null;
      return {
        id: item.id,
        itemNameJa: itemName?.ja ?? "",
        itemNameEn: itemName?.en ?? "",
        unit: item.unit ?? "",
        toleranceMin:
          item.toleranceMin != null ? Number(item.toleranceMin) : null,
        toleranceMax:
          item.toleranceMax != null ? Number(item.toleranceMax) : null,
        isRequired: item.isRequired,
        sortOrder: item.sortOrder,
      };
    }),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };

  return (
    <InspectionTemplateDetail auditEntries={auditEntries} record={record} />
  );
}
