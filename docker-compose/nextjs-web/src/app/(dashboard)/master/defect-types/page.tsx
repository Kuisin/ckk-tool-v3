import {
  type DefectTypeRow,
  DefectTypeTable,
} from "@/components/master/defect-types/DefectTypeTable";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 不良種類 一覧 (MS09). */
export default async function MasterDefectTypesPage() {
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
      nameEn: name?.en ?? "",
      sortOrder: r.sortOrder,
      isActive: r.isActive,
    };
  });

  return <DefectTypeTable rows={rows} />;
}
