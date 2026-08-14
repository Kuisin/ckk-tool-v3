import { PurchaseRequestTable } from "@/components/purchase/purchase-requests/PurchaseRequestTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchPurchaseRequests } from "./data";

export const dynamic = "force-dynamic";

/** 購買依頼 一覧 (PU04). */
export default async function PurchasePurchaseRequestsPage() {
  const denied = await requireAppRead("purchase-requests");
  if (denied) return denied;
  const rows = await fetchPurchaseRequests();
  return <PurchaseRequestTable rows={rows} />;
}
