import {
  type WorkLocationGroupRow,
  WorkLocationsManager,
} from "@/components/master/work-locations/WorkLocationsManager";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { readWorkLocationTypes } from "@/lib/work-locations";

export const dynamic = "force-dynamic";

/** 作業場所マスタ (MS0D) — 単一管理画面（グループ + 場所 + 種別）。 */
export default async function MasterWorkLocationsPage() {
  const denied = await requireAppRead("master-work-locations");
  if (denied) return denied;
  const [groups, types, plants] = await Promise.all([
    prisma.workLocationGroup.findMany({
      include: {
        plant: { select: { name: true } },
        locations: {
          include: {
            _count: { select: { stepPlans: true, stepActuals: true } },
          },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        },
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    readWorkLocationTypes(),
    prisma.plant.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, name: true, code: true },
    }),
  ]);

  const rows: WorkLocationGroupRow[] = groups.map((g) => {
    const name = g.name as LocalizedText | null;
    return {
      id: g.id,
      code: g.code,
      nameJa: name?.ja ?? "",
      nameEn: name?.en ?? "",
      typeKey: g.typeKey,
      plantId: g.plantId,
      plantName: g.plant
        ? localized(g.plant.name as LocalizedText | null)
        : null,
      sortOrder: g.sortOrder,
      isActive: g.isActive,
      notes: g.notes ?? "",
      locations: g.locations.map((l) => {
        const lname = l.name as LocalizedText | null;
        return {
          id: l.id,
          code: l.code,
          nameJa: lname?.ja ?? "",
          nameEn: lname?.en ?? "",
          capacity: l.capacity,
          sortOrder: l.sortOrder,
          isActive: l.isActive,
          notes: l.notes ?? "",
          planCount: l._count.stepPlans,
          actualCount: l._count.stepActuals,
        };
      }),
    };
  });

  return (
    <WorkLocationsManager
      groups={rows}
      plantOptions={plants.map((f) => ({
        value: String(f.id),
        label: `${localized(f.name as LocalizedText | null)}（${f.code}）`,
      }))}
      types={types.map((t) => ({
        key: t.key,
        labelJa: t.label.ja,
        labelEn: t.label.en,
        builtin: t.builtin ?? false,
      }))}
    />
  );
}
