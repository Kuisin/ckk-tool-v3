import { ProductTypeEditForm } from "@/components/settings/ProductTypeEditForm";
import { getProductItemSettings } from "@/lib/product-settings";

export const dynamic = "force-dynamic";

/** 製品種別の新規作成。 */
export default async function ProductTypeNewPage() {
  const { defs, types } = await getProductItemSettings();
  return <ProductTypeEditForm allTypes={types} defs={defs} />;
}
