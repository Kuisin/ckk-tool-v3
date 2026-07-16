import { notFound } from "next/navigation";
import { PurchaseRequestDetail } from "@/components/purchase/purchase-requests/PurchaseRequestDetail";
import { fetchApprovalTrail, isApprover } from "@/lib/approvals";
import { fetchAuditEntries } from "@/lib/audit";
import { fetchPurchaseRequest, fetchSupplierOptions } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return {
    title: `購買依頼 ${decodeURIComponent(id)} | CKK 業務管理システム`,
  };
}

/** 購買依頼 詳細 (PU24). URL id = request_number（PRQ-YYYYMM-NNNNN）. */
export default async function PurchasePurchaseRequestsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const requestNumber = decodeURIComponent(id);

  const [purchaseRequest, auditEntries, canApprove, supplierOptions, trail] =
    await Promise.all([
      fetchPurchaseRequest(requestNumber),
      fetchAuditEntries("purchase_requests", requestNumber),
      isApprover("FIRST"),
      fetchSupplierOptions(),
      fetchApprovalTrail("purchase_requests", requestNumber),
    ]);
  if (!purchaseRequest) notFound();

  return (
    <PurchaseRequestDetail
      approvalTrail={trail}
      auditEntries={auditEntries}
      canApprove={canApprove}
      purchaseRequest={purchaseRequest}
      supplierOptions={supplierOptions}
    />
  );
}
