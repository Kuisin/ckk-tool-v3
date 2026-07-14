import { MaterialInventoryTable } from "@/components/production/inventory/materials/MaterialInventoryTable";
import { fetchMaterialInventories } from "./data";

export const dynamic = "force-dynamic";

/** 素材在庫 一覧 (PD05). */
export default async function ProductionInventoryMaterialsPage() {
  const rows = await fetchMaterialInventories();
  return <MaterialInventoryTable rows={rows} />;
}
