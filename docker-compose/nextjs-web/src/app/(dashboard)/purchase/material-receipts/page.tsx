import { MaterialReceiptTable } from "@/components/purchase/material-receipts/MaterialReceiptTable";
import { fetchMaterialReceipts } from "./data";

export const dynamic = "force-dynamic";

/** 素材入荷 一覧 (PU01). */
export default async function PurchaseMaterialReceiptsPage() {
  const rows = await fetchMaterialReceipts();
  return <MaterialReceiptTable rows={rows} />;
}
