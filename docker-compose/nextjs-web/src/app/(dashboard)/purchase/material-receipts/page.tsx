import { MaterialReceiptTable } from "@/components/purchase/material-receipts/MaterialReceiptTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchMaterialReceipts } from "./data";

export const dynamic = "force-dynamic";

/** 素材入荷 一覧 (PU01). */
export default async function PurchaseMaterialReceiptsPage() {
  const denied = await requireAppRead("material-receipts");
  if (denied) return denied;
  const rows = await fetchMaterialReceipts();
  return <MaterialReceiptTable rows={rows} />;
}
