import { WorkOrderTable } from "@/components/production/work-orders/WorkOrderTable";
import { fetchWorkOrders } from "./data";

export const dynamic = "force-dynamic";

/** 指示書 一覧 (PD02). */
export default async function ProductionWorkOrdersPage() {
  const rows = await fetchWorkOrders();
  return <WorkOrderTable rows={rows} />;
}
