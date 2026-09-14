import { getLocale } from "next-intl/server";
import { ProductForm } from "@/components/master/products/ProductForm";
import { requireAppRead } from "@/lib/authz-page";
import type { Locale } from "@/lib/i18n";
import {
  getProductItemDefs,
  getResolvedProductTypes,
} from "@/lib/product-settings";
import { loadTaxCategoryOptions } from "@/lib/tax-categories";

export const dynamic = "force-dynamic";

/** 製品 新規作成 (MS14). 素材仕様は材種のサーバー検索で選ぶため事前ロード不要。 */
export default async function MasterProductsNewPage() {
  const denied = await requireAppRead("master-products");
  if (denied) return denied;
  const locale = (await getLocale()) as Locale;
  const [productTypes, itemDefs, taxCategoryOptions] = await Promise.all([
    getResolvedProductTypes(),
    getProductItemDefs(),
    loadTaxCategoryOptions(locale),
  ]);
  return (
    <ProductForm
      itemDefs={itemDefs}
      productTypes={productTypes}
      taxCategoryOptions={taxCategoryOptions}
    />
  );
}
