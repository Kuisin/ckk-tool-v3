import { getLocale } from "next-intl/server";
import { ProductForm } from "@/components/master/products/ProductForm";
import { requireAppRead } from "@/lib/authz-page";
import type { Locale } from "@/lib/i18n";
import { loadTaxCategoryOptions } from "@/lib/tax-categories";

export const dynamic = "force-dynamic";

/** 製品 新規作成 (MS14). 仕様（材種・寸法・製品項目）は設計図 (PD06) で入れる。 */
export default async function MasterProductsNewPage() {
  const denied = await requireAppRead("master-products");
  if (denied) return denied;
  const locale = (await getLocale()) as Locale;
  const taxCategoryOptions = await loadTaxCategoryOptions(locale);
  return <ProductForm taxCategoryOptions={taxCategoryOptions} />;
}
