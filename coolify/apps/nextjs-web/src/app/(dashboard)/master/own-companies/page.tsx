import {
  type OwnCompanyRow,
  OwnCompanyTable,
} from "@/components/master/own-companies/OwnCompanyTable";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 自社法人 一覧 (MS0I). */
export default async function MasterOwnCompaniesPage() {
  const denied = await requireAppRead("master-own-companies");
  if (denied) return denied;
  const [records, unassignedPlants] = await Promise.all([
    prisma.ownCompany.findMany({
      orderBy: [{ isDefault: "desc" }, { code: "asc" }],
      include: { _count: { select: { plants: true } } },
    }),
    // 自社法人が未設定の拠点は既定の法人として扱う（拠点マスタの説明どおり）。
    // 数えないと、拠点をまだ割り当てていない既定の法人が「拠点数 0」に見える。
    prisma.plant.count({ where: { ownCompanyId: null } }),
  ]);

  const rows: OwnCompanyRow[] = records.map((r) => ({
    id: r.id,
    code: r.code,
    name: localized(r.name as LocalizedText | null),
    invoiceRegistrationNo: r.invoiceRegistrationNo,
    plantCount: r._count.plants + (r.isDefault ? unassignedPlants : 0),
    isDefault: r.isDefault,
    isActive: r.isActive,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return <OwnCompanyTable rows={rows} />;
}
