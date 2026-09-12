import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ProductForm } from "@/components/master/products/ProductForm";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { formatProductNumber } from "@/lib/doc-number";
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

/** 製品 編集 (MS24 edit). */
export default async function MasterProductsEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-products");
  if (denied) return denied;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const r = await prisma.product.findUnique({
    where: { id },
    include: { materialType: { select: { code: true, name: true } } },
  });
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  const spec =
    r.spec && typeof r.spec === "object" && !Array.isArray(r.spec)
      ? Object.entries(r.spec as Record<string, unknown>).map(
          ([key, value]) => ({ key, value: String(value) }),
        )
      : [];

  const materialTypeLabel = r.materialType
    ? `${r.materialType.code ?? ""} — ${localized(r.materialType.name as LocalizedText | null)}`
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
        code: formatProductNumber(r.yearMonth, r.seq),
        nameJa: name?.ja ?? "",
        nameTranslations: localizedTranslations(name),
        materialTypeId:
          r.materialTypeId != null ? String(r.materialTypeId) : null,
        materialTypeLabel,
        diameterMm: r.diameterMm != null ? Number(r.diameterMm) : null,
        lengthMm: r.lengthMm != null ? Number(r.lengthMm) : null,
        unit: r.unit,
        taxCategoryId: r.taxCategoryId,
        matchNames: r.matchNames,
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
