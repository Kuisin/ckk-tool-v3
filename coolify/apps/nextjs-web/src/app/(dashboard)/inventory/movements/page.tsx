import { MovementTable } from "@/components/inventory/movements/MovementTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchInventoryMovements, fetchPlantOptions } from "./data";

export const dynamic = "force-dynamic";

/** 入出庫伝票 一覧 (PD07). */
export default async function InventoryMovementsPage() {
  const denied = await requireAppRead("inventory-movements");
  if (denied) return denied;
  const [list, plantOptions] = await Promise.all([
    fetchInventoryMovements(),
    fetchPlantOptions(),
  ]);
  return (
    <MovementTable
      plantOptions={plantOptions}
      rows={list.rows}
      truncated={list.truncated}
    />
  );
}
