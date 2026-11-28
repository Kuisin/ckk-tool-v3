import { OrderLineTable } from "@/components/sales/order-lines/OrderLineTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchOrderLines } from "./data";

export const dynamic = "force-dynamic";

/** 注文明細 一覧 (SA05). 権限は注文請書と同じ order_acceptance（lib/app-list.ts）。 */
export default async function ProductionOrderLinesPage() {
  const denied = await requireAppRead("order-lines");
  if (denied) return denied;
  const rows = await fetchOrderLines();
  return <OrderLineTable rows={rows} />;
}
