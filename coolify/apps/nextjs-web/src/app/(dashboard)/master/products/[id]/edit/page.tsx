import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ProductForm } from "@/components/master/products/ProductForm";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localizedTranslations } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
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
  });
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  const locale = (await getLocale()) as Locale;
  const taxCategoryOptions = await loadTaxCategoryOptions(locale);

  return (
    <ProductForm
      initial={{
        id: r.id,
        code: r.code,
        nameJa: name?.ja ?? "",
        nameTranslations: localizedTranslations(name),
        unit: r.unit,
        taxCategoryId: r.taxCategoryId,
        matchNames: r.matchNames,
        isExternalProduct: r.isExternalProduct,
        makerName: r.makerName ?? "",
        isActive: r.isActive,
        notes: r.notes ?? "",
      }}
      taxCategoryOptions={taxCategoryOptions}
    />
  );
}
