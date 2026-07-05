import { notFound } from "next/navigation";
import { ProductForm } from "@/components/master/products/ProductForm";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 製品 編集 (MS23 edit). */
export default async function MasterProductsEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [r, materials] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
    prisma.material.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
    }),
  ]);
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  const spec =
    r.spec && typeof r.spec === "object" && !Array.isArray(r.spec)
      ? Object.entries(r.spec as Record<string, unknown>).map(
          ([key, value]) => ({ key, value: String(value) }),
        )
      : [];

  const materialOptions = materials.map((m) => ({
    value: m.id,
    label: `${m.id}（${localized(m.name as LocalizedText | null)}）`,
  }));

  return (
    <ProductForm
      initial={{
        id: r.id,
        nameJa: name?.ja ?? "",
        nameEn: name?.en ?? "",
        materialId: r.materialId,
        unit: r.unit,
        isActive: r.isActive,
        notes: r.notes ?? "",
        spec,
      }}
      materialOptions={materialOptions}
    />
  );
}
