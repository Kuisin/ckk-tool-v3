import { notFound, redirect } from "next/navigation";
import { InspectionTemplateForm } from "@/components/master/inspection-templates/InspectionTemplateForm";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 検査表テンプレート 編集 (MS28 edit) — コードはロック、属性のみ編集可. */
export default async function MasterInspectionTemplatesEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const r = await prisma.inspectionTemplate.findUnique({
    where: { id },
    include: {
      relatedProcessStep: true,
      _count: { select: { workOrderTemplates: true, inspectionRecords: true } },
    },
  });
  if (!r) notFound();
  // 使用中バージョンは定義変更不可 — 詳細（ロック案内 + 新バージョン作成）へ
  if (r._count.workOrderTemplates > 0 || r._count.inspectionRecords > 0) {
    redirect(`/master/inspection-templates/${id}`);
  }

  const name = r.name as LocalizedText | null;

  return (
    <InspectionTemplateForm
      initial={{
        id: r.id,
        code: r.code,
        nameJa: name?.ja ?? "",
        nameEn: name?.en ?? "",
        relatedProcessStepId:
          r.relatedProcessStepId != null
            ? String(r.relatedProcessStepId)
            : null,
        relatedProcessStepLabel: r.relatedProcessStep
          ? `${localized(r.relatedProcessStep.name as LocalizedText | null)}（${r.relatedProcessStep.code}）`
          : "",
        isActive: r.isActive,
      }}
    />
  );
}
