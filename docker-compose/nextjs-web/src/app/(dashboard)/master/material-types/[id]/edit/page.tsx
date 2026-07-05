import { notFound } from "next/navigation";
import { MaterialTypeForm } from "@/components/master/material-types/MaterialTypeForm";
import { prisma } from "@/lib/db";
import type { LocalizedText } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 材種 編集 (MS24 edit). */
export default async function MasterMaterialTypesEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const r = await prisma.materialType.findUnique({ where: { id } });
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  const description = r.description as LocalizedText | null;

  return (
    <MaterialTypeForm
      initial={{
        id: r.id,
        nameJa: name?.ja ?? "",
        nameEn: name?.en ?? "",
        descriptionJa: description?.ja ?? "",
        descriptionEn: description?.en ?? "",
        isActive: r.isActive,
      }}
    />
  );
}
