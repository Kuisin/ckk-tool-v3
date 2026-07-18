import { notFound } from "next/navigation";
import { ProductTypeEditForm } from "@/components/settings/ProductTypeEditForm";
import { getProductItemSettings } from "@/lib/product-settings";

export const dynamic = "force-dynamic";

/** 製品種別の編集。 */
export default async function ProductTypeEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const typeId = decodeURIComponent(id);
  const { defs, types } = await getProductItemSettings();
  if (!types.some((t) => t.id === typeId)) notFound();
  return <ProductTypeEditForm allTypes={types} defs={defs} typeId={typeId} />;
}
