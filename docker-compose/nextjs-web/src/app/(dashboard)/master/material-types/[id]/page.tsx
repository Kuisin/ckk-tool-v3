import { notFound } from "next/navigation";
import {
  MaterialTypeDetail,
  type MaterialTypeDetailData,
} from "@/components/master/material-types/MaterialTypeDetail";
import { prisma } from "@/lib/db";
import { MATERIAL_FORM_LABEL } from "@/lib/enum-labels";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 材種 詳細 (MS24). */
export default async function MasterMaterialTypesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const r = await prisma.materialType.findUnique({
    where: { id },
    include: { materials: { orderBy: { id: "asc" } } },
  });
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  const description = r.description as LocalizedText | null;

  const record: MaterialTypeDetailData = {
    id: r.id,
    nameJa: name?.ja ?? "",
    nameEn: name?.en ?? "",
    descriptionJa: description?.ja ?? "",
    descriptionEn: description?.en ?? "",
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    materials: r.materials.map((m) => ({
      id: m.id,
      name: localized(m.name as LocalizedText | null),
      form: MATERIAL_FORM_LABEL[m.materialForm] ?? m.materialForm,
      unit: m.unit,
      isActive: m.isActive,
    })),
  };

  return <MaterialTypeDetail record={record} />;
}
