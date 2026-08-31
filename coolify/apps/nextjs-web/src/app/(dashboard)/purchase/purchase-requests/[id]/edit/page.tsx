import { notFound, redirect } from "next/navigation";
import { isEditable } from "@/components/purchase/purchase-requests/model";
import { PurchaseRequestForm } from "@/components/purchase/purchase-requests/PurchaseRequestForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchPlantOptions, fetchPurchaseRequest } from "../../data";

export const dynamic = "force-dynamic";

/**
 * 購買依頼 編集 (PU21 → edit)。
 *
 * 編集できるのは下書き（DRAFT）・差し戻し（REJECTED）のみ — それ以外は詳細へ
 * リダイレクト（サーバーアクション側でも同じガードを行う）。明細は保存時に
 * 全置換。
 */
export default async function PurchasePurchaseRequestsEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("purchase-requests");
  if (denied) return denied;
  const { id } = await params;
  const requestNumber = decodeURIComponent(id);

  const [purchaseRequest, plantOptions] = await Promise.all([
    fetchPurchaseRequest(requestNumber),
    fetchPlantOptions(),
  ]);
  if (!purchaseRequest) notFound();
  if (!isEditable(purchaseRequest)) {
    redirect(`/purchase/purchase-requests/${purchaseRequest.requestNumber}`);
  }

  return (
    <PurchaseRequestForm
      mode="edit"
      plantOptions={plantOptions}
      purchaseRequest={purchaseRequest}
    />
  );
}
