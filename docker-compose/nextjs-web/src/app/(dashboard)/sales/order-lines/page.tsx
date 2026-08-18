import { OrderLineTable } from "@/components/sales/order-lines/OrderLineTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchOrderLines } from "./data";

export const dynamic = "force-dynamic";

/** 受注明細 一覧 (PD01). ランチャー非掲載 — 権限は指示書と同じ work_order。 */
export default async function ProductionOrderLinesPage() {
  const denied = await requireAppRead("order-lines");
  if (denied) return denied;
  const rows = await fetchOrderLines();
  return <OrderLineTable rows={rows} />;
}
