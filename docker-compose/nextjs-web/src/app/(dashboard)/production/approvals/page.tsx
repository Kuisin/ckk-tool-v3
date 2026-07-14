import { WorkOrderTable } from "@/components/production/work-orders/WorkOrderTable";
import { fetchPendingApprovals } from "../work-orders/data";

export const dynamic = "force-dynamic";

/** 承認管理 一覧 (PD03) — 第一・第二承認待ちの指示書。 */
export default async function ProductionApprovalsPage() {
  const rows = await fetchPendingApprovals();
  return <WorkOrderTable rows={rows} variant="approvals" />;
}
