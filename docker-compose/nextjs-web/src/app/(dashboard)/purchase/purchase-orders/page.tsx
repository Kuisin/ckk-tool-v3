import { PurchaseOrderTable } from "@/components/purchase/purchase-orders/PurchaseOrderTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchPurchaseOrders } from "./data";

export const dynamic = "force-dynamic";

/** 素材発注書 一覧 (PU03). */
export default async function PurchasePurchaseOrdersPage() {
  const denied = await requireAppRead("purchase-orders");
  if (denied) return denied;
  const rows = await fetchPurchaseOrders();
  return <PurchaseOrderTable rows={rows} />;
}
