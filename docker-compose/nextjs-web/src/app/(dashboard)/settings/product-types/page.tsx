import { ProductTypesForm } from "@/components/settings/ProductTypesForm";
import { getProductTypes } from "@/lib/product-settings";

export const dynamic = "force-dynamic";

/** 製品種別（SY04）— 種別ごとに新規製品作成時の入力項目を定義。system 権限。 */
export default async function ProductTypesPage() {
  const types = await getProductTypes();
  return <ProductTypesForm initial={types} />;
}
