import { PurchaseRequestForm } from "@/components/purchase/purchase-requests/PurchaseRequestForm";
import { fetchFactoryOptions } from "../data";

export const dynamic = "force-dynamic";

/**
 * 購買依頼 新規作成 (PU14)。
 *
 * 保存時に nextDocumentNumber("PURCHASE_REQUEST") で PRQ-YYYYMM-NNNNN を
 * 採番して作成する。単価・仕入先は持たない（発注書側で確定）。保存後は詳細へ。
 */
export default async function PurchasePurchaseRequestsNewPage() {
  const factoryOptions = await fetchFactoryOptions();
  return <PurchaseRequestForm factoryOptions={factoryOptions} mode="create" />;
}
