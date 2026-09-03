import { notFound } from "next/navigation";
import {
  InspectionTemplateDetail,
  type InspectionTemplateDetailData,
} from "@/components/master/inspection-templates/InspectionTemplateDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { fetchApprovalGroupOptions, toItemRow } from "../data";

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
  const [r, auditEntries, groupOptions] = await Promise.all([
    prisma.inspectionTemplate.findUnique({
      where: { id },
      include: {
        relatedProcessStep: true,
        product: { select: { name: true } },
        group: { select: { name: true } },
        imageFile: { select: { filename: true } },
        approvalGroup: { select: { name: true } },
        approvers: {
          include: { user: { select: { displayName: true } } },
          orderBy: { sortOrder: "asc" },
        },
        items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
        _count: {
          select: { workOrderStepTemplates: true, inspectionRecords: true },
        },
      },
    }),
    fetchAuditEntries("inspection_templates", String(id)),
    fetchApprovalGroupOptions(),
  ]);
  if (!r) notFound();

  // 同一 code の全バージョン（使用状況付き・新しい順）
  const siblings = await prisma.inspectionTemplate.findMany({
    where: { code: r.code },
    include: {
      _count: {
        select: {
          items: true,
          workOrderStepTemplates: true,
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
    productName: r.product
      ? localized(r.product.name as LocalizedText | null)
      : "",
    groupName: r.group ? localized(r.group.name as LocalizedText | null) : "",
    imageFilename: r.imageFile?.filename ?? null,
    samplingMode: r.samplingMode,
    samplingValue: r.samplingValue == null ? null : Number(r.samplingValue),
    recordStyle: r.recordStyle,
    layoutStyle: r.layoutStyle,
    sampleNaming: r.sampleNaming,
    approvalGroupId:
      r.approvalGroupId != null ? String(r.approvalGroupId) : null,
    approvalGroupName: r.approvalGroup
      ? localized(r.approvalGroup.name as LocalizedText | null)
      : null,
    approvers: r.approvers.map((a) => ({
      value: a.userId,
      label: a.user.displayName,
    })),
    isActive: r.isActive,
    isLocked:
      r._count.workOrderStepTemplates > 0 || r._count.inspectionRecords > 0,
    isLatestVersion: r.version === latestVersion,
    items: r.items.map(toItemRow),
    versions: siblings.map((s) => ({
      id: s.id,
      version: s.version,
      isActive: s.isActive,
      inUse:
        s._count.workOrderStepTemplates > 0 || s._count.inspectionRecords > 0,
      itemCount: s._count.items,
      updatedAt: s.updatedAt.toISOString(),
    })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };

  return (
    <InspectionTemplateDetail
      auditEntries={auditEntries}
      groupOptions={groupOptions}
      record={record}
    />
  );
}
