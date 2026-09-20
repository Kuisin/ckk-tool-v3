import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ProductForm } from "@/components/master/products/ProductForm";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import {
  type LocalizedText,
  localized,
  localizedTranslations,
} from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import {
  getProductItemDefs,
  getResolvedProductTypes,
} from "@/lib/product-settings";
import { loadTaxCategoryOptions } from "@/lib/tax-categories";

export const dynamic = "force-dynamic";

/** 製品 編集 (MS24 edit). URL の id は items.id（品目統合 第 3 段）。 */
export default async function MasterProductsEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-products");
  if (denied) return denied;
  const { id: idParam } = await params;
  const itemId = Number(idParam);
  if (!Number.isInteger(itemId)) notFound();
  const r = await prisma.item.findFirst({
    where: { id: itemId, itemType: "PRODUCT" },
    include: { requiresMaterialType: { select: { code: true, name: true } } },
  });
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  const spec =
    r.spec && typeof r.spec === "object" && !Array.isArray(r.spec)
      ? Object.entries(r.spec as Record<string, unknown>).map(
          ([key, value]) => ({ key, value: String(value) }),
        )
      : [];

  const materialTypeLabel = r.requiresMaterialType
    ? `${r.requiresMaterialType.code ?? ""} — ${localized(r.requiresMaterialType.name as LocalizedText | null)}`
    : "";

  const locale = (await getLocale()) as Locale;
  const [productTypes, itemDefs, taxCategoryOptions] = await Promise.all([
    getResolvedProductTypes(),
    getProductItemDefs(),
    loadTaxCategoryOptions(locale),
  ]);

  return (
    <ProductForm
      initial={{
        id: r.id,
        code: r.code,
        nameJa: name?.ja ?? "",
        nameTranslations: localizedTranslations(name),
        // 製品が**要求する**素材（items.requires*）— 素材マスタの同名の列
        // （実寸）とは意味が逆（items.prisma 冒頭の注意）。
        materialTypeId:
          r.requiresMaterialTypeId != null
            ? String(r.requiresMaterialTypeId)
            : null,
        materialTypeLabel,
        diameterMm:
          r.requiresDiameterMm != null ? Number(r.requiresDiameterMm) : null,
        lengthMm:
          r.requiresLengthMm != null ? Number(r.requiresLengthMm) : null,
        unit: r.unit,
        taxCategoryId: r.taxCategoryId,
        matchNames: r.matchNames,
        isExternalProduct: r.isExternalProduct,
        makerName: r.makerName ?? "",
        isActive: r.isActive,
        notes: r.notes ?? "",
        spec,
      }}
      itemDefs={itemDefs}
      productTypes={productTypes}
      taxCategoryOptions={taxCategoryOptions}
    />
  );
}
