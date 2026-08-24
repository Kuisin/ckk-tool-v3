import { WorkOrderTable } from "@/components/production/work-orders/WorkOrderTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchWorkOrders } from "./data";

export const dynamic = "force-dynamic";

/** 指示書 一覧 (PD02). */
export default async function ProductionWorkOrdersPage() {
  const denied = await requireAppRead("work-orders");
  if (denied) return denied;
  const rows = await fetchWorkOrders();
  return <WorkOrderTable rows={rows} />;
}
