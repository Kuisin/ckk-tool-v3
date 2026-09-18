import { StockTakeForm } from "@/components/production/stock-takes/StockTakeForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchPlantOptions, fetchStorageLocationOptions } from "../data";

export const dynamic = "force-dynamic";

/** 棚卸 新規登録 (PD18) — 拠点 + 保管場所を選び、対象バケットをその場で取り込む。 */
export default async function ProductionStockTakesNewPage() {
  const denied = await requireAppRead("stock-takes");
  if (denied) return denied;
  const [plantOptions, storageLocationOptions] = await Promise.all([
    fetchPlantOptions(),
    fetchStorageLocationOptions(),
  ]);
  return (
    <StockTakeForm
      plantOptions={plantOptions}
      storageLocationOptions={storageLocationOptions}
    />
  );
}
