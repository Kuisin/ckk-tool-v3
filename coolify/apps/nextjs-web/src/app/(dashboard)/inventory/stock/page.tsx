import { StockOverviewTable } from "@/components/inventory/stock/StockOverviewTable";
import { requireAppRead } from "@/lib/authz-page";
import {
  fetchPlantOptions,
  fetchStockOverview,
  fetchStorageLocationOptions,
} from "./data";

export const dynamic = "force-dynamic";

/** 在庫一覧 (ST02) — 拠点・保管場所から見る在庫。 */
export default async function StockOverviewPage() {
  const denied = await requireAppRead("stock-overview");
  if (denied) return denied;
  const [list, plantOptions, storageLocationOptions] = await Promise.all([
    fetchStockOverview(),
    fetchPlantOptions(),
    fetchStorageLocationOptions(),
  ]);
  return (
    <StockOverviewTable
      plantOptions={plantOptions}
      rows={list.rows}
      storageLocationOptions={storageLocationOptions}
      truncated={list.truncated}
    />
  );
}
