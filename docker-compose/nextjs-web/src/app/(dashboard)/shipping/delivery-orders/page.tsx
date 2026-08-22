import { DeliveryOrderTable } from "@/components/shipping/delivery-orders/DeliveryOrderTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchDeliveryOrders } from "./data";

export const dynamic = "force-dynamic";

/** 出荷書 一覧 (SH01). */
export default async function ShippingDeliveryOrdersPage() {
  const denied = await requireAppRead("delivery-orders");
  if (denied) return denied;
  const rows = await fetchDeliveryOrders();
  return <DeliveryOrderTable rows={rows} />;
}
