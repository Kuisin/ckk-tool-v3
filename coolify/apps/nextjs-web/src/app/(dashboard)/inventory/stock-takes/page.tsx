import { StockTakeTable } from "@/components/inventory/stock-takes/StockTakeTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchStockTakes } from "./data";

export const dynamic = "force-dynamic";

/** 棚卸 一覧 (PD08). */
export default async function ProductionStockTakesPage() {
  const denied = await requireAppRead("stock-takes");
  if (denied) return denied;
  const rows = await fetchStockTakes();
  return <StockTakeTable rows={rows} />;
}
