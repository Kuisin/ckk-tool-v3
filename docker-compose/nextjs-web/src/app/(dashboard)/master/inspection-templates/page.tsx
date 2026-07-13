import {
  type InspectionTemplateRow,
  InspectionTemplateTable,
} from "@/components/master/inspection-templates/InspectionTemplateTable";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 検査表テンプレート 一覧 (MS08). */
export default async function MasterInspectionTemplatesPage() {
  const records = await prisma.inspectionTemplate.findMany({
    include: {
      relatedProcessStep: true,
      _count: { select: { items: true } },
    },
    orderBy: { code: "asc" },
  });

  const rows: InspectionTemplateRow[] = records.map((r) => ({
    id: r.id,
    code: r.code,
    name: localized(r.name as LocalizedText | null),
    relatedProcessStep: r.relatedProcessStep
      ? localized(r.relatedProcessStep.name as LocalizedText | null)
      : "",
    itemCount: r._count.items,
    isActive: r.isActive,
  }));

  return <InspectionTemplateTable rows={rows} />;
}
