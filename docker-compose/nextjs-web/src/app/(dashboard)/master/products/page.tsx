import {
  type ProductRow,
  ProductTable,
} from "@/components/master/products/ProductTable";
import { prisma } from "@/lib/db";
import { formatProductNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 製品 一覧 (MS03). */
export default async function MasterProductsPage() {
  const [records, materials] = await Promise.all([
    prisma.product.findMany({ orderBy: { id: "asc" } }),
    prisma.material.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const materialCodeById = new Map(materials.map((m) => [m.id, m.code]));
  const rows: ProductRow[] = records.map((r) => ({
    id: r.id,
    code: formatProductNumber(r.yearMonth, r.seq),
    name: localized(r.name as LocalizedText | null),
    materialId:
      r.materialId != null
        ? (materialCodeById.get(r.materialId) ?? String(r.materialId))
        : null,
    unit: r.unit,
    isActive: r.isActive,
  }));

  const materialOptions = materials.map((m) => ({
    value: String(m.id),
    label: `${m.code}（${localized(m.name as LocalizedText | null)}）`,
  }));

  return <ProductTable materialOptions={materialOptions} rows={rows} />;
}
