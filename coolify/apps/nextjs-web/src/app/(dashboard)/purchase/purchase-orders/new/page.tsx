import { PurchaseOrderForm } from "@/components/purchase/purchase-orders/PurchaseOrderForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchPlantOptions, fetchSupplierOptions } from "../data";

export const dynamic = "force-dynamic";

/**
 * 素材発注書 新規作成 (PU12)。
 *
 * 保存時に nextDocumentNumber("PURCHASE") で PO-YYYYMM-NNNNN を採番し、
 * 明細と合計金額をサーバー側で計算して作成する。保存後は詳細へ。
 */
export default async function PurchasePurchaseOrdersNewPage() {
  const denied = await requireAppRead("purchase-orders");
  if (denied) return denied;
  const [supplierOptions, plantOptions] = await Promise.all([
    fetchSupplierOptions(),
    fetchPlantOptions(),
  ]);
  return (
    <PurchaseOrderForm
      mode="create"
      plantOptions={plantOptions}
      supplierOptions={supplierOptions}
    />
  );
}
