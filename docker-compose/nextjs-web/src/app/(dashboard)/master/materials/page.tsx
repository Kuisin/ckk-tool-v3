import {
  type MaterialRow,
  MaterialTable,
} from "@/components/master/materials/MaterialTable";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 素材 一覧 (MS05). */
export default async function MasterMaterialsPage() {
  const [records, types] = await Promise.all([
    prisma.material.findMany({ orderBy: { id: "asc" } }),
    prisma.materialType.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
    }),
  ]);

  const rows: MaterialRow[] = records.map((r) => ({
    id: r.id,
    materialTypeId: r.materialTypeId,
    name: localized(r.name as LocalizedText | null),
    form: r.materialForm,
    unit: r.unit,
    isActive: r.isActive,
  }));

  const typeOptions = types.map((t) => ({
    value: t.id,
    label: `${t.id}（${localized(t.name as LocalizedText | null)}）`,
  }));

  return <MaterialTable rows={rows} typeOptions={typeOptions} />;
}
