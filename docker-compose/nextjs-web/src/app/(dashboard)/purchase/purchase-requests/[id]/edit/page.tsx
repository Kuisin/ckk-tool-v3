import { notFound, redirect } from "next/navigation";
import { isEditable } from "@/components/purchase/purchase-requests/model";
import { PurchaseRequestForm } from "@/components/purchase/purchase-requests/PurchaseRequestForm";
import { fetchFactoryOptions, fetchPurchaseRequest } from "../../data";

export const dynamic = "force-dynamic";

/**
 * 購買依頼 編集 (PU24 → edit)。
 *
 * 編集できるのは作成中（DRAFT）・差し戻し（REJECTED）のみ — それ以外は詳細へ
 * リダイレクト（サーバーアクション側でも同じガードを行う）。明細は保存時に
 * 全置換。
 */
export default async function PurchasePurchaseRequestsEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const requestNumber = decodeURIComponent(id);

  const [purchaseRequest, factoryOptions] = await Promise.all([
    fetchPurchaseRequest(requestNumber),
    fetchFactoryOptions(),
  ]);
  if (!purchaseRequest) notFound();
  if (!isEditable(purchaseRequest)) {
    redirect(`/purchase/purchase-requests/${purchaseRequest.requestNumber}`);
  }

  return (
    <PurchaseRequestForm
      factoryOptions={factoryOptions}
      mode="edit"
      purchaseRequest={purchaseRequest}
    />
  );
}
