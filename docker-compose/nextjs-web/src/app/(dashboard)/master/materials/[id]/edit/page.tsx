import { notFound } from "next/navigation";
import { MaterialForm } from "@/components/master/materials/MaterialForm";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 素材 編集 (MS25 edit). */
export default async function MasterMaterialsEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [r, types] = await Promise.all([
    prisma.material.findUnique({ where: { id } }),
    prisma.materialType.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
    }),
  ]);
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  const typeOptions = types.map((t) => ({
    value: t.id,
    label: `${t.id}（${localized(t.name as LocalizedText | null)}）`,
  }));

  return (
    <MaterialForm
      initial={{
        id: r.id,
        materialTypeId: r.materialTypeId,
        nameJa: name?.ja ?? "",
        nameEn: name?.en ?? "",
        unit: r.unit,
        form: r.materialForm,
        isActive: r.isActive,
        notes: r.notes ?? "",
      }}
      typeOptions={typeOptions}
    />
  );
}
