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
  const records = await prisma.product.findMany({
    orderBy: { id: "asc" },
    include: { materialType: { select: { code: true, name: true } } },
  });

  const rows: ProductRow[] = records.map((r) => {
    const mtName = r.materialType
      ? localized(r.materialType.name as LocalizedText | null)
      : "";
    return {
      id: r.id,
      code: formatProductNumber(r.yearMonth, r.seq),
      name: localized(r.name as LocalizedText | null),
      materialTypeId:
        r.materialTypeId != null ? String(r.materialTypeId) : null,
      materialTypeLabel: r.materialType
        ? `${r.materialType.code ?? ""}${mtName ? ` — ${mtName}` : ""}`
        : "",
      diameterMm: r.diameterMm != null ? Number(r.diameterMm) : null,
      lengthMm: r.lengthMm != null ? Number(r.lengthMm) : null,
      unit: r.unit,
      isActive: r.isActive,
    };
  });

  return <ProductTable rows={rows} />;
}
