import { ShippingOrderTable } from "@/components/shipping/shipping-orders/ShippingOrderTable";
import { fetchShippingOrders } from "./data";

export const dynamic = "force-dynamic";

/** 出荷書 一覧 (SH01). */
export default async function ShippingShippingOrdersPage() {
  const rows = await fetchShippingOrders();
  return <ShippingOrderTable rows={rows} />;
}
