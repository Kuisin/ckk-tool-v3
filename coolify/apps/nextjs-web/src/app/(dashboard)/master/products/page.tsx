import {
  type ProductRow,
  ProductTable,
} from "@/components/master/products/ProductTable";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { resolveItemSpecs } from "@/lib/design-spec";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * 製品 一覧 (MS04).
 *
 * 行の id は **items.id**（品目統合 第 3 段）— 詳細・編集の URL も同じ空間。
 * 材種・直径・全長は設計図の確定済みの版から読む（lib/design-spec.ts
 * resolveItemSpecs — 汎用の最新版 → 最後に確定した版）。
 */
export default async function MasterProductsPage() {
  const denied = await requireAppRead("master-products");
  if (denied) return denied;
  const records = await prisma.item.findMany({
    where: { itemType: "PRODUCT" },
    orderBy: { id: "asc" },
    include: {
      // 顧客品番は検索にだけ使う（列には出さない）。有効な行の品番と別表記。
      customerProductCodeRefs: {
        where: { isActive: true },
        select: { code: true, aliases: true },
      },
    },
  });

  const specs = await resolveItemSpecs(records.map((r) => r.id));

  const rows: ProductRow[] = records.map((r) => {
    const spec = specs.get(r.id);
    return {
      id: r.id,
      code: r.code,
      name: localized(r.name as LocalizedText | null),
      materialTypeId:
        spec?.materialTypeId != null ? String(spec.materialTypeId) : null,
      materialTypeLabel: spec?.materialTypeCode
        ? `${spec.materialTypeCode}${spec.materialTypeName ? ` — ${spec.materialTypeName}` : ""}`
        : "",
      matchNames: r.matchNames,
      customerCodes: r.customerProductCodeRefs.flatMap((c) => [
        c.code,
        ...c.aliases,
      ]),
      diameterMm: spec?.diameterMm ?? null,
      lengthMm: spec?.lengthMm ?? null,
      unit: r.unit,
      taxCategoryId: r.taxCategoryId,
      isExternalProduct: r.isExternalProduct,
      isActive: r.isActive,
    };
  });

  return <ProductTable rows={rows} />;
}
