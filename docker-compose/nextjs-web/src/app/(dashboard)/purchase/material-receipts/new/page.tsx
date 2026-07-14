import { MaterialReceiptForm } from "@/components/purchase/material-receipts/MaterialReceiptForm";
import { fetchFactoryOptions, fetchSupplierOptions } from "../data";

export const dynamic = "force-dynamic";

/**
 * 素材入荷 新規登録 (PU11) — 直接調達の入荷。
 *
 * 登録と同時に onMaterialReceipt で入荷先工場の素材在庫へ入庫する。
 * 発注入荷は素材発注書 (PU03) の「入荷完了」から自動作成される。
 */
export default async function PurchaseMaterialReceiptsNewPage() {
  const [supplierOptions, factoryOptions] = await Promise.all([
    fetchSupplierOptions(),
    fetchFactoryOptions(),
  ]);
  return (
    <MaterialReceiptForm
      factoryOptions={factoryOptions}
      supplierOptions={supplierOptions}
    />
  );
}
