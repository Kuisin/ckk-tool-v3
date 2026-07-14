import { notFound } from "next/navigation";
import { ProductInventoryDetail } from "@/components/production/inventory/products/ProductInventoryDetail";
import { fetchProductInventoryDetail } from "../data";

export const dynamic = "force-dynamic";

/** 製品在庫 詳細 (PD24). URL id = product_inventory.id (uuid). */
export default async function ProductionInventoryProductsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await fetchProductInventoryDetail(id).catch(() => null);
  if (!record) notFound();

  return <ProductInventoryDetail record={record} />;
}
