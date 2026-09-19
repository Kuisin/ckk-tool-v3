import {
  type ProductRow,
  ProductTable,
} from "@/components/master/products/ProductTable";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * 製品 一覧 (MS04).
 *
 * 行の id は **items.id**（品目統合 第 3 段）— 詳細・編集の URL も同じ空間。
 * 材種・直径・全長は `requires*`（その製品が**要求する**素材）で、素材マスタの
 * 同名の列（実寸）とは意味が逆（items.prisma 冒頭の注意）。
 */
export default async function MasterProductsPage() {
  const denied = await requireAppRead("master-products");
  if (denied) return denied;
  const records = await prisma.item.findMany({
    where: { itemType: "PRODUCT" },
    orderBy: { id: "asc" },
    include: {
      requiresMaterialType: { select: { code: true, name: true } },
      // 顧客品番は検索にだけ使う（列には出さない）。有効な行の品番と別表記。
      customerProductCodeRefs: {
        where: { isActive: true },
        select: { code: true, aliases: true },
      },
    },
  });

  const rows: ProductRow[] = records.map((r) => {
    const mtName = r.requiresMaterialType
      ? localized(r.requiresMaterialType.name as LocalizedText | null)
      : "";
    return {
      id: r.id,
      code: r.code,
      name: localized(r.name as LocalizedText | null),
      materialTypeId:
        r.requiresMaterialTypeId != null
          ? String(r.requiresMaterialTypeId)
          : null,
      materialTypeLabel: r.requiresMaterialType
        ? `${r.requiresMaterialType.code ?? ""}${mtName ? ` — ${mtName}` : ""}`
        : "",
      matchNames: r.matchNames,
      customerCodes: r.customerProductCodeRefs.flatMap((c) => [
        c.code,
        ...c.aliases,
      ]),
      diameterMm:
        r.requiresDiameterMm != null ? Number(r.requiresDiameterMm) : null,
      lengthMm: r.requiresLengthMm != null ? Number(r.requiresLengthMm) : null,
      unit: r.unit,
      taxCategoryId: r.taxCategoryId,
      isActive: r.isActive,
    };
  });

  return <ProductTable rows={rows} />;
}
