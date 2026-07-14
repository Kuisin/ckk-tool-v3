import { SalesOrderTable } from "@/components/production/sales-orders/SalesOrderTable";
import { fetchSalesOrders } from "./data";

export const dynamic = "force-dynamic";

/** 注文請書 一覧 (PD01). */
export default async function ProductionSalesOrdersPage() {
  const rows = await fetchSalesOrders();
  return <SalesOrderTable rows={rows} />;
}
