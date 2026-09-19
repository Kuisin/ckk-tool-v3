import { GoodsMovementForm } from "@/components/inventory/goods-movement/GoodsMovementForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchEndpointPlantOptions, fetchMovementTypeOptions } from "./data";

export const dynamic = "force-dynamic";

/** 手動入出庫 (ST06) — 人が在庫を動かす唯一の口。 */
export default async function GoodsMovementPage() {
  const denied = await requireAppRead("goods-movement");
  if (denied) return denied;
  const [movementTypes, plants] = await Promise.all([
    fetchMovementTypeOptions(),
    fetchEndpointPlantOptions(),
  ]);
  return <GoodsMovementForm movementTypes={movementTypes} plants={plants} />;
}
