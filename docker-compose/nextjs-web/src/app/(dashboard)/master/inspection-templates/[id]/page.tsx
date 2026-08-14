import { notFound } from "next/navigation";
import {
  InspectionTemplateDetail,
  type InspectionTemplateDetailData,
} from "@/components/master/inspection-templates/InspectionTemplateDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { toItemRow } from "../data";

export const dynamic = "force-dynamic";

/** 検査表テンプレート 詳細 (MS29). */
export default async function MasterInspectionTemplatesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-inspection-templates");
  if (denied) return denied;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const [r, auditEntries] = await Promise.all([
    prisma.inspectionTemplate.findUnique({
      where: { id },
      include: {
        relatedProcessStep: true,
        items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
        _count: {
          select: { workOrderTemplates: true, inspectionRecords: true },
        },
      },
    }),
    fetchAuditEntries("inspection_templates", String(id)),
  ]);
  if (!r) notFound();

  // 同一 code の全バージョン（使用状況付き・新しい順）
  const siblings = await prisma.inspectionTemplate.findMany({
    where: { code: r.code },
    include: {
      _count: {
        select: {
          items: true,
          workOrderTemplates: true,
          inspectionRecords: true,
        },
      },
    },
    orderBy: { version: "desc" },
  });

  const name = r.name as LocalizedText | null;
  const latestVersion = siblings[0]?.version ?? r.version;

  const record: InspectionTemplateDetailData = {
    id: r.id,
    code: r.code,
    version: r.version,
    nameJa: name?.ja ?? "",
    nameEn: name?.en ?? "",
    relatedProcessStep: r.relatedProcessStep
      ? localized(r.relatedProcessStep.name as LocalizedText | null)
      : "",
    samplingMode: r.samplingMode,
    samplingValue: r.samplingValue == null ? null : Number(r.samplingValue),
    recordStyle: r.recordStyle,
    isActive: r.isActive,
    isLocked: r._count.workOrderTemplates > 0 || r._count.inspectionRecords > 0,
    isLatestVersion: r.version === latestVersion,
    items: r.items.map(toItemRow),
    versions: siblings.map((s) => ({
      id: s.id,
      version: s.version,
      isActive: s.isActive,
      inUse: s._count.workOrderTemplates > 0 || s._count.inspectionRecords > 0,
      itemCount: s._count.items,
      updatedAt: s.updatedAt.toISOString(),
    })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };

  return (
    <InspectionTemplateDetail auditEntries={auditEntries} record={record} />
  );
}
