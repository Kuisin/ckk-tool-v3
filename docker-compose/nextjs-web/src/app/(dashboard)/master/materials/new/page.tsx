import { MaterialForm } from "@/components/master/materials/MaterialForm";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 素材 新規作成 (MS15). */
export default async function MasterMaterialsNewPage() {
  const types = await prisma.materialType.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
  });

  const typeOptions = types.map((t) => ({
    value: t.id,
    label: `${t.id}（${localized(t.name as LocalizedText | null)}）`,
  }));

  return <MaterialForm typeOptions={typeOptions} />;
}
