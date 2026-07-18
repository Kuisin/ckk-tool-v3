import { notFound } from "next/navigation";
import { ItemDefEditForm } from "@/components/settings/ItemDefEditForm";
import { getProductItemDefs } from "@/lib/product-settings";

export const dynamic = "force-dynamic";

/** 製品項目 — 項目定義の編集。 */
export default async function ProductItemEditPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const itemKey = decodeURIComponent(key);
  const defs = await getProductItemDefs();
  if (!defs.some((d) => d.key === itemKey)) notFound();
  return <ItemDefEditForm allDefs={defs} itemKey={itemKey} />;
}
