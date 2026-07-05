import { notFound } from "next/navigation";
import {
  MaterialDetail,
  type MaterialDetailData,
} from "@/components/master/materials/MaterialDetail";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 素材 詳細 (MS25). */
export default async function MasterMaterialsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [r, types] = await Promise.all([
    prisma.material.findUnique({
      where: { id },
      include: {
        materialType: true,
        products: { orderBy: { id: "asc" } },
      },
    }),
    prisma.materialType.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
    }),
  ]);
  if (!r) notFound();

  const name = r.name as LocalizedText | null;

  const record: MaterialDetailData = {
    id: r.id,
    materialTypeId: r.materialTypeId,
    materialTypeName: localized(r.materialType.name as LocalizedText | null),
    nameJa: name?.ja ?? "",
    nameEn: name?.en ?? "",
    form: r.materialForm,
    unit: r.unit,
    isActive: r.isActive,
    notes: r.notes ?? "",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    products: r.products.map((p) => ({
      id: p.id,
      name: localized(p.name as LocalizedText | null),
    })),
  };

  const typeOptions = types.map((t) => ({
    value: t.id,
    label: `${t.id}（${localized(t.name as LocalizedText | null)}）`,
  }));

  return <MaterialDetail record={record} typeOptions={typeOptions} />;
}
