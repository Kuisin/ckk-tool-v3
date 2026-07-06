import {
  type MaterialTypeRow,
  MaterialTypeTable,
} from "@/components/master/material-types/MaterialTypeTable";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

// DB-backed list — always render fresh data.
export const dynamic = "force-dynamic";

/** 材種 一覧 (MS04). */
export default async function MasterMaterialTypesPage() {
  const records = await prisma.materialType.findMany({
    include: { manufacturer: true, shape: true },
    orderBy: { id: "asc" },
  });

  const rows: MaterialTypeRow[] = records.map((r) => ({
    id: r.id,
    name: localized(r.name as LocalizedText | null),
    structured: r.manufacturerCode != null,
    manufacturerName: r.manufacturer
      ? localized(r.manufacturer.name as LocalizedText | null)
      : "",
    shapeName: r.shape ? localized(r.shape.name as LocalizedText | null) : "",
    isActive: r.isActive,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return <MaterialTypeTable rows={rows} />;
}
