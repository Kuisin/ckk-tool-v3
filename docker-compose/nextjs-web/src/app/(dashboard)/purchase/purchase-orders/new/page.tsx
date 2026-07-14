import { PurchaseOrderForm } from "@/components/purchase/purchase-orders/PurchaseOrderForm";
import { fetchFactoryOptions, fetchSupplierOptions } from "../data";

export const dynamic = "force-dynamic";

/**
 * 素材発注書 新規作成 (PU13)。
 *
 * 保存時に nextDocumentNumber("PURCHASE") で PO-YYYYMM-NNNNN を採番し、
 * 明細と合計金額をサーバー側で計算して作成する。保存後は詳細へ。
 */
export default async function PurchasePurchaseOrdersNewPage() {
  const [supplierOptions, factoryOptions] = await Promise.all([
    fetchSupplierOptions(),
    fetchFactoryOptions(),
  ]);
  return (
    <PurchaseOrderForm
      factoryOptions={factoryOptions}
      mode="create"
      supplierOptions={supplierOptions}
    />
  );
}
