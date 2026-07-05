import { ProductForm } from "@/components/master/products/ProductForm";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 製品 新規作成 (MS13). */
export default async function MasterProductsNewPage() {
  const materials = await prisma.material.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
  });

  const materialOptions = materials.map((m) => ({
    value: m.id,
    label: `${m.id}（${localized(m.name as LocalizedText | null)}）`,
  }));

  return <ProductForm materialOptions={materialOptions} />;
}
