import {
  type RegrindItemRow,
  RegrindItemTable,
} from "@/components/master/regrind-items/RegrindItemTable";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import {
  type LocalizedText,
  localized,
  localizedTranslations,
} from "@/lib/format";
import { regrindSizeBandLabel } from "@/lib/regrind-item-label";
import { getServerLocale } from "@/lib/user-preferences";

export const dynamic = "force-dynamic";

/** 再研磨品目 一覧 (MS0H). */
export default async function MasterRegrindItemsPage() {
  const denied = await requireAppRead("master-regrind-items");
  if (denied) return denied;
  const locale = await getServerLocale();
  const records = await prisma.item.findMany({
    where: { itemType: "REGRIND" },
    orderBy: [{ code: "asc" }],
  });

  const rows: RegrindItemRow[] = records.map((r) => {
    const name = r.name as LocalizedText | null;
    return {
      id: r.id,
      code: r.code ?? String(r.id),
      name: localized(name, locale),
      nameJa: name?.ja ?? "",
      nameTranslations: localizedTranslations(name),
      unit: r.unit,
      standardUnitPrice:
        r.standardUnitPrice != null ? Number(r.standardUnitPrice) : null,
      toolClass: r.regrindToolClass,
      location: r.regrindLocation,
      flutes: r.regrindFlutes,
      sizeMinMm: r.regrindSizeMinMm != null ? Number(r.regrindSizeMinMm) : null,
      sizeMaxMm: r.regrindSizeMaxMm != null ? Number(r.regrindSizeMaxMm) : null,
      sizeBand:
        regrindSizeBandLabel(r.regrindSizeMinMm, r.regrindSizeMaxMm) ?? "",
      matchNames: r.matchNames,
      isActive: r.isActive,
      notes: r.notes ?? "",
    };
  });

  // 絞り込みの選択肢は**実際に登録されている値**から作る（条件は自由記入なので
  // マスタが無い）。使われていない語を出しても選べる先が無い。
  const uniqueSorted = (values: (string | null)[]) =>
    [...new Set(values.filter((v): v is string => !!v))].sort((a, b) =>
      a.localeCompare(b, "ja"),
    );

  return (
    <RegrindItemTable
      locationOptions={uniqueSorted(records.map((r) => r.regrindLocation))}
      rows={rows}
      toolClassOptions={uniqueSorted(records.map((r) => r.regrindToolClass))}
    />
  );
}
