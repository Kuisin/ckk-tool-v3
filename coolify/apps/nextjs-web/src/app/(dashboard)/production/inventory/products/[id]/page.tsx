import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProductInventoryDetail } from "@/components/production/inventory/products/ProductInventoryDetail";
import { requireAppRead } from "@/lib/authz-page";
import { fetchProductInventoryDetail } from "../data";

export const dynamic = "force-dynamic";

/** 製品在庫 詳細 (PD24). URL id = product_inventory.id (uuid). */
export default async function ProductionInventoryProductsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("inventory");
  if (denied) return denied;
  const tr = await getTranslations();
  const { id } = await params;
  const record = await fetchProductInventoryDetail(id, tr).catch(() => null);
  if (!record) notFound();

  return <ProductInventoryDetail record={record} />;
}
