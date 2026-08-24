import { MaterialReceiptForm } from "@/components/purchase/material-receipts/MaterialReceiptForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchPlantOptions, fetchSupplierOptions } from "../data";

export const dynamic = "force-dynamic";

/**
 * 素材入荷 新規登録 (PU13) — 直接調達の入荷。
 *
 * 登録と同時に onMaterialReceipt で入荷先拠点の素材在庫へ入庫する。
 * 発注入荷は素材発注書 (PU02) の「入荷完了」から自動作成される。
 */
export default async function PurchaseMaterialReceiptsNewPage() {
  const denied = await requireAppRead("material-receipts");
  if (denied) return denied;
  const [supplierOptions, plantOptions] = await Promise.all([
    fetchSupplierOptions(),
    fetchPlantOptions(),
  ]);
  return (
    <MaterialReceiptForm
      plantOptions={plantOptions}
      supplierOptions={supplierOptions}
    />
  );
}
