import {
  type RegionRow,
  RegionsPanel,
} from "@/components/master/plants/RegionsPanel";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import type { LocalizedText } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 地域マスタ — 拠点 (MS0B) のサブページ。REGION スコープの実体。 */
export default async function MasterPlantRegionsPage() {
  const denied = await requireAppRead("master-plants");
  if (denied) return denied;
  const records = await prisma.region.findMany({
    orderBy: { code: "asc" },
    include: { _count: { select: { plants: true } } },
  });

  const rows: RegionRow[] = records.map((r) => {
    const name = r.name as LocalizedText | null;
    return {
      id: r.id,
      code: r.code,
      nameJa: name?.ja ?? "",
      nameEn: name?.en ?? "",
      plantCount: r._count.plants,
      isActive: r.isActive,
    };
  });

  return <RegionsPanel rows={rows} />;
}
