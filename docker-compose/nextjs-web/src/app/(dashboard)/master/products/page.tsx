import {
  type ProductRow,
  ProductTable,
} from "@/components/master/products/ProductTable";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 製品 一覧 (MS03). */
export default async function MasterProductsPage() {
  const [records, materials] = await Promise.all([
    prisma.product.findMany({ orderBy: { id: "asc" } }),
    prisma.material.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
    }),
  ]);

  const rows: ProductRow[] = records.map((r) => ({
    id: r.id,
    name: localized(r.name as LocalizedText | null),
    materialId: r.materialId,
    unit: r.unit,
    isActive: r.isActive,
  }));

  const materialOptions = materials.map((m) => ({
    value: m.id,
    label: `${m.id}（${localized(m.name as LocalizedText | null)}）`,
  }));

  return <ProductTable materialOptions={materialOptions} rows={rows} />;
}
