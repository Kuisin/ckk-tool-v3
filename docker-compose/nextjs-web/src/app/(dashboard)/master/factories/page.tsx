import {
  type FactoryRow,
  FactoryTable,
} from "@/components/master/factories/FactoryTable";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 工場 一覧 (MS0B). */
export default async function MasterFactoriesPage() {
  const records = await prisma.factory.findMany({ orderBy: { code: "asc" } });

  const rows: FactoryRow[] = records.map((r) => ({
    id: r.id,
    code: r.code,
    name: localized(r.name as LocalizedText | null),
    countryCode: r.countryCode,
    isActive: r.isActive,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return <FactoryTable rows={rows} />;
}
