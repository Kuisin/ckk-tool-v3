import {
  type PlantRow,
  PlantTable,
} from "@/components/master/plants/PlantTable";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 拠点 一覧 (MS0B). */
export default async function MasterPlantsPage() {
  const denied = await requireAppRead("master-plants");
  if (denied) return denied;
  const records = await prisma.plant.findMany({ orderBy: { code: "asc" } });

  const rows: PlantRow[] = records.map((r) => ({
    id: r.id,
    code: r.code,
    name: localized(r.name as LocalizedText | null),
    countryCode: r.countryCode,
    isActive: r.isActive,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return <PlantTable rows={rows} />;
}
