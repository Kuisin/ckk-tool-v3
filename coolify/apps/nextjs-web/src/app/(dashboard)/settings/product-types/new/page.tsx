import { ProductTypeEditForm } from "@/components/settings/ProductTypeEditForm";
import { requireAppRead } from "@/lib/authz-page";
import { getProductItemSettings } from "@/lib/product-settings";

export const dynamic = "force-dynamic";

/** 製品種別の新規作成。 */
export default async function ProductTypeNewPage() {
  const denied = await requireAppRead("product-types");
  if (denied) return denied;
  const { defs, types } = await getProductItemSettings();
  return <ProductTypeEditForm allTypes={types} defs={defs} />;
}
