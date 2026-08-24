import { PendingShipmentBoard } from "@/components/shipping/pending-shipments/PendingShipmentBoard";
import { requireAppRead } from "@/lib/authz-page";
import { fetchOpenDeliveryOrders, fetchUnshippedOrderLines } from "./data";

export const dynamic = "force-dynamic";

/**
 * 未処理出荷書 (SH03) — 完成分が出荷書に載っていない注文明細（未手配）と、
 * まだ出ていない出荷書（出荷準備中）の作業キュー。
 */
export default async function ShippingPendingShipmentsPage() {
  const denied = await requireAppRead("pending-shipments");
  if (denied) return denied;
  const [unshippedRows, openRows] = await Promise.all([
    fetchUnshippedOrderLines(),
    fetchOpenDeliveryOrders(),
  ]);
  return (
    <PendingShipmentBoard openRows={openRows} unshippedRows={unshippedRows} />
  );
}
