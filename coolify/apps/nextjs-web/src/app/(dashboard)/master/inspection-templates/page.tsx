import {
  type InspectionTemplateRow,
  InspectionTemplateTable,
} from "@/components/master/inspection-templates/InspectionTemplateTable";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { fetchInspectionTemplateGroupOptions } from "./data";

export const dynamic = "force-dynamic";

/** 検査表テンプレート 一覧 (MS09) — code ごとに最新バージョンのみ表示。 */
export default async function MasterInspectionTemplatesPage() {
  const denied = await requireAppRead("master-inspection-templates");
  if (denied) return denied;
  const [records, groupOptions] = await Promise.all([
    prisma.inspectionTemplate.findMany({
      include: {
        relatedProcessStep: true,
        product: { select: { name: true } },
        group: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: [{ code: "asc" }, { version: "desc" }],
    }),
    fetchInspectionTemplateGroupOptions(),
  ]);

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
    productName: r.product
      ? localized(r.product.name as LocalizedText | null)
      : "",
    groupId: r.groupId,
    groupName: r.group ? localized(r.group.name as LocalizedText | null) : "",
    itemCount: r._count.items,
    isActive: r.isActive,
  }));

  return <InspectionTemplateTable groupOptions={groupOptions} rows={rows} />;
}
