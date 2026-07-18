import { ItemDefEditForm } from "@/components/settings/ItemDefEditForm";
import { getProductItemDefs } from "@/lib/product-settings";

export const dynamic = "force-dynamic";

/** 製品項目 — 項目定義の新規作成。 */
export default async function ProductItemNewPage() {
  const defs = await getProductItemDefs();
  return <ItemDefEditForm allDefs={defs} />;
}
