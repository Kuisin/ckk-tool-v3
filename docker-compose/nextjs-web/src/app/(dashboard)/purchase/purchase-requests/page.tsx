import { PurchaseRequestTable } from "@/components/purchase/purchase-requests/PurchaseRequestTable";
import { fetchPurchaseRequests } from "./data";

export const dynamic = "force-dynamic";

/** 購買依頼 一覧 (PU04). */
export default async function PurchasePurchaseRequestsPage() {
  const rows = await fetchPurchaseRequests();
  return <PurchaseRequestTable rows={rows} />;
}
