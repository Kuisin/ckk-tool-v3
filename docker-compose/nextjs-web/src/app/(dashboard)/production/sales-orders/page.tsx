import { SalesOrderTable } from "@/components/production/sales-orders/SalesOrderTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchSalesOrders } from "./data";

export const dynamic = "force-dynamic";

/** 注文請書 一覧 (PD01). ランチャー非掲載 — 権限は指示書と同じ work_order。 */
export default async function ProductionSalesOrdersPage() {
  const denied = await requireAppRead("work-orders");
  if (denied) return denied;
  const rows = await fetchSalesOrders();
  return <SalesOrderTable rows={rows} />;
}
