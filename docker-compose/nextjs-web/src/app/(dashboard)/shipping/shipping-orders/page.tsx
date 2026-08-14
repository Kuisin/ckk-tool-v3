import { ShippingOrderTable } from "@/components/shipping/shipping-orders/ShippingOrderTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchShippingOrders } from "./data";

export const dynamic = "force-dynamic";

/** 出荷書 一覧 (SH01). */
export default async function ShippingShippingOrdersPage() {
  const denied = await requireAppRead("shipping-orders");
  if (denied) return denied;
  const rows = await fetchShippingOrders();
  return <ShippingOrderTable rows={rows} />;
}
