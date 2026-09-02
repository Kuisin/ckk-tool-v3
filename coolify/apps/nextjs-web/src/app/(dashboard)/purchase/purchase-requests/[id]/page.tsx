import { notFound } from "next/navigation";
import { PurchaseRequestDetail } from "@/components/purchase/purchase-requests/PurchaseRequestDetail";
import { appLabelForKey } from "@/lib/app-list";
import { fetchApprovalState, fetchApprovalTrail } from "@/lib/approvals";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { formatDocPageTitle } from "@/lib/page-title";
import { getServerLocale } from "@/lib/user-preferences";
import { fetchPurchaseRequest, fetchSupplierOptions } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getServerLocale();
  return {
    title: formatDocPageTitle(
      appLabelForKey("purchase-requests", "購買依頼", locale), // i18n-ignore — ja はそのまま使う（訳の実体は appLabelForKey 内の en/zh マップ）
      decodeURIComponent(id),
    ),
  };
}

/** 購買依頼 詳細 (PU21). URL id = request_number（PRQ-YYYYMM-NNNNN）. */
export default async function PurchasePurchaseRequestsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("purchase-requests");
  if (denied) return denied;
  const { id } = await params;
  const requestNumber = decodeURIComponent(id);

  const [purchaseRequest, auditEntries, approval, supplierOptions, trail] =
    await Promise.all([
      fetchPurchaseRequest(requestNumber),
      fetchAuditEntries("purchase_requests", requestNumber),
      fetchApprovalState("purchase_requests", requestNumber),
      fetchSupplierOptions(),
      fetchApprovalTrail("purchase_requests", requestNumber),
    ]);
  if (!purchaseRequest) notFound();

  return (
    <PurchaseRequestDetail
      approval={approval}
      approvalTrail={trail}
      auditEntries={auditEntries}
      purchaseRequest={purchaseRequest}
      supplierOptions={supplierOptions}
    />
  );
}
