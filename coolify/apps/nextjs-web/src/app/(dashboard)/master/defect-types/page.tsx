import {
  type DefectTypeRow,
  DefectTypeTable,
} from "@/components/master/defect-types/DefectTypeTable";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import {
  type LocalizedText,
  localized,
  localizedTranslations,
} from "@/lib/format";

export const dynamic = "force-dynamic";

/** 不良種類 一覧 (MS0A). */
export default async function MasterDefectTypesPage() {
  const denied = await requireAppRead("master-defect-types");
  if (denied) return denied;
  const records = await prisma.defectType.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });

  const rows: DefectTypeRow[] = records.map((r) => {
    const name = r.name as LocalizedText | null;
    return {
      id: r.id,
      code: r.code,
      name: localized(name),
      nameJa: name?.ja ?? "",
      nameTranslations: localizedTranslations(name),
      sortOrder: r.sortOrder,
      isActive: r.isActive,
    };
  });

  return <DefectTypeTable rows={rows} />;
}
