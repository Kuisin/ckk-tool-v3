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
  const records = await prisma.ownCompany.findMany({
    orderBy: [{ isDefault: "desc" }, { code: "asc" }],
    include: { _count: { select: { plants: true } } },
  });

  const rows: OwnCompanyRow[] = records.map((r) => ({
    id: r.id,
    code: r.code,
    name: localized(r.name as LocalizedText | null),
    invoiceRegistrationNo: r.invoiceRegistrationNo,
    plantCount: r._count.plants,
    isDefault: r.isDefault,
    isActive: r.isActive,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return <OwnCompanyTable rows={rows} />;
}
