import { notFound, redirect } from "next/navigation";
import { isEditable } from "@/components/purchase/purchase-orders/model";
import { PurchaseOrderForm } from "@/components/purchase/purchase-orders/PurchaseOrderForm";
import {
  fetchFactoryOptions,
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
  const { id } = await params;
  const poNumber = decodeURIComponent(id);

  const [purchaseOrder, supplierOptions, factoryOptions] = await Promise.all([
    fetchPurchaseOrder(poNumber),
    fetchSupplierOptions(),
    fetchFactoryOptions(),
  ]);
  if (!purchaseOrder) notFound();
  if (!isEditable(purchaseOrder)) {
    redirect(`/purchase/purchase-orders/${purchaseOrder.poNumber}`);
  }

  return (
    <PurchaseOrderForm
      factoryOptions={factoryOptions}
      mode="edit"
      purchaseOrder={purchaseOrder}
      supplierOptions={supplierOptions}
    />
  );
}
