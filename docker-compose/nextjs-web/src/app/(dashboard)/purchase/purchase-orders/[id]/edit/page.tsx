import { notFound, redirect } from "next/navigation";
import { isEditable } from "@/components/purchase/purchase-orders/model";
import { PurchaseOrderForm } from "@/components/purchase/purchase-orders/PurchaseOrderForm";
import { requireAppRead } from "@/lib/authz-page";
import {
  fetchPlantOptions,
  fetchPurchaseOrder,
  fetchSupplierOptions,
} from "../../data";

export const dynamic = "force-dynamic";

/**
 * 素材発注書 編集 (PU23 → edit)。
 *
 * 編集できるのは作成中（DRAFT）のみ — それ以外は詳細へリダイレクト
 * （サーバーアクション側でも同じガードを行う）。明細は保存時に全置換。
 */
export default async function PurchasePurchaseOrdersEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("purchase-orders");
  if (denied) return denied;
  const { id } = await params;
  const poNumber = decodeURIComponent(id);

  const [purchaseOrder, supplierOptions, plantOptions] = await Promise.all([
    fetchPurchaseOrder(poNumber),
    fetchSupplierOptions(),
    fetchPlantOptions(),
  ]);
  if (!purchaseOrder) notFound();
  if (!isEditable(purchaseOrder)) {
    redirect(`/purchase/purchase-orders/${purchaseOrder.poNumber}`);
  }

  return (
    <PurchaseOrderForm
      mode="edit"
      plantOptions={plantOptions}
      purchaseOrder={purchaseOrder}
      supplierOptions={supplierOptions}
    />
  );
}
