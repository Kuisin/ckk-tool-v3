import { notFound } from "next/navigation";
import { MaterialTypeForm } from "@/components/master/material-types/MaterialTypeForm";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 材種 編集 (MS24 edit) — 名称・説明・有効のみ（コード構成は不変）. */
export default async function MasterMaterialTypesEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const r = await prisma.materialType.findUnique({
    where: { id },
    include: { manufacturer: true, grade: true, shape: true },
  });
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  const description = r.description as LocalizedText | null;

  return (
    <MaterialTypeForm
      initial={{
        id: r.id,
        composition:
          r.manufacturerCode && r.kindCode
            ? {
                manufacturerLabel: `${r.manufacturerCode} — ${localized(
                  r.manufacturer?.name as LocalizedText | null,
                )}`,
                gradeLabel: `${r.gradeCode} — ${localized(
                  r.grade?.name as LocalizedText | null,
                )}`,
                shapeLabel: `${r.shapeCode} — ${localized(
                  r.shape?.name as LocalizedText | null,
                )}`,
                kindCode: r.kindCode,
              }
            : null,
        nameJa: name?.ja ?? "",
        nameEn: name?.en ?? "",
        descriptionJa: description?.ja ?? "",
        descriptionEn: description?.en ?? "",
        isActive: r.isActive,
      }}
    />
  );
}
