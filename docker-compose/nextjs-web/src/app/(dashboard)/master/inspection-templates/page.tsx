import {
  type InspectionTemplateRow,
  InspectionTemplateTable,
} from "@/components/master/inspection-templates/InspectionTemplateTable";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 検査表テンプレート 一覧 (MS08) — code ごとに最新バージョンのみ表示。 */
export default async function MasterInspectionTemplatesPage() {
  const records = await prisma.inspectionTemplate.findMany({
    include: {
      relatedProcessStep: true,
      _count: { select: { items: true } },
    },
    orderBy: [{ code: "asc" }, { version: "desc" }],
  });

  // 旧バージョンは詳細の「バージョン」タブから辿る
  const versionCounts = new Map<string, number>();
  for (const r of records) {
    versionCounts.set(r.code, (versionCounts.get(r.code) ?? 0) + 1);
  }
  const latest = records.filter(
    (r, i) => i === 0 || records[i - 1].code !== r.code,
  );

  const rows: InspectionTemplateRow[] = latest.map((r) => ({
    id: r.id,
    code: r.code,
    version: r.version,
    versionCount: versionCounts.get(r.code) ?? 1,
    name: localized(r.name as LocalizedText | null),
    relatedProcessStep: r.relatedProcessStep
      ? localized(r.relatedProcessStep.name as LocalizedText | null)
      : "",
    itemCount: r._count.items,
    isActive: r.isActive,
  }));

  return <InspectionTemplateTable rows={rows} />;
}
