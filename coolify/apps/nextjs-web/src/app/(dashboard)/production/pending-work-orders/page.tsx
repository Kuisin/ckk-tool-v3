import { PendingWorkOrderBoard } from "@/components/production/pending-work-orders/PendingWorkOrderBoard";
import { requireAppRead } from "@/lib/authz-page";
import { fetchOpenWorkOrders, fetchUnplannedOrderLines } from "./data";

export const dynamic = "force-dynamic";

/**
 * 未処理指示書 (PD05) — 指示書がまだ足りていない注文明細（未手配）と、
 * 作られたが完了していない指示書（進行中）の作業キュー。
 */
export default async function ProductionPendingWorkOrdersPage() {
  const denied = await requireAppRead("pending-work-orders");
  if (denied) return denied;
  const [unplannedRows, openRows] = await Promise.all([
    fetchUnplannedOrderLines(),
    fetchOpenWorkOrders(),
  ]);
  return (
    <PendingWorkOrderBoard openRows={openRows} unplannedRows={unplannedRows} />
  );
}
