import { ProductInventoryTable } from "@/components/production/inventory/products/ProductInventoryTable";
import { fetchProductInventories, fetchWipRows } from "./data";

export const dynamic = "force-dynamic";

/** 製品在庫 一覧 (PD04) — 製品在庫 / 仕掛品。 */
export default async function ProductionInventoryProductsPage() {
  const [rows, wipRows] = await Promise.all([
    fetchProductInventories(),
    fetchWipRows(),
  ]);
  return <ProductInventoryTable rows={rows} wipRows={wipRows} />;
}
