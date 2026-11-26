import {
  type MachineModelRow,
  type WorkLocationGroupRow,
  WorkLocationsManager,
} from "@/components/master/work-locations/WorkLocationsManager";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import {
  type LocalizedText,
  localized,
  localizedTranslations,
} from "@/lib/format";
import { readWorkLocationTypes } from "@/lib/work-locations";

export const dynamic = "force-dynamic";

/** 作業場所マスタ (MS0D) — 単一管理画面（グループ + 場所 + 種別 + 機種）。 */
export default async function MasterWorkLocationsPage() {
  const denied = await requireAppRead("master-work-locations");
  if (denied) return denied;
  const [groups, types, plants, models, modelPrograms] = await Promise.all([
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
    prisma.machineModel.findMany({
      include: {
        _count: { select: { workLocations: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
    // プログラムは版ごとに行があるので、機種ごとの本数はプログラム（program_key）で数える。
    prisma.designProgramMachineModel.findMany({
      select: {
        machineModelId: true,
        program: { select: { programKey: true } },
      },
    }),
  ]);
  const programKeysByModel = new Map<number, Set<string>>();
  for (const r of modelPrograms) {
    const set = programKeysByModel.get(r.machineModelId) ?? new Set<string>();
    set.add(r.program.programKey);
    programKeysByModel.set(r.machineModelId, set);
  }
  const modelName = new Map(
    models.map((m) => [m.id, localized(m.name as LocalizedText | null)]),
  );
  const modelRows: MachineModelRow[] = models.map((m) => {
    const name = m.name as LocalizedText | null;
    return {
      id: m.id,
      code: m.code,
      nameJa: name?.ja ?? "",
      nameTranslations: localizedTranslations(name),
      maker: m.maker ?? "",
      sortOrder: m.sortOrder,
      isActive: m.isActive,
      notes: m.notes ?? "",
      machineCount: m._count.workLocations,
      programCount: programKeysByModel.get(m.id)?.size ?? 0,
    };
  });

  const rows: WorkLocationGroupRow[] = groups.map((g) => {
    const name = g.name as LocalizedText | null;
    return {
      id: g.id,
      code: g.code,
      nameJa: name?.ja ?? "",
      nameEn: name?.en ?? "",
      nameTranslations: localizedTranslations(name),
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
          nameTranslations: localizedTranslations(lname),
          capacity: l.capacity,
          machineModelId: l.machineModelId,
          machineModelName:
            l.machineModelId != null
              ? (modelName.get(l.machineModelId) ?? null)
              : null,
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
      machineModels={modelRows}
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
