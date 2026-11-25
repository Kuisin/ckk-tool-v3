import { notFound } from "next/navigation";
import { PurchaseRequestDetail } from "@/components/purchase/purchase-requests/PurchaseRequestDetail";
import { appLabelForKey } from "@/lib/app-list";
import { fetchApprovalState, fetchApprovalTrail } from "@/lib/approvals";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { docIdOf, docNo } from "@/lib/doc-number";
import { docKeyFromParam } from "@/lib/doc-param";
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
      docNo(decodeURIComponent(id)),
    ),
  };
}

/** 購買依頼 詳細 (PU21). URL id = 法人コード付きの依頼番号（CKK~PRQ-2026-00001）. */
export default async function PurchasePurchaseRequestsDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await requireAppRead("purchase-requests");
  if (denied) return denied;
  const { id } = await params;
  // 番号だけ・旧番号で来た URL は正規の URL へ転送される。
  const requestNumber = docIdOf(
    await docKeyFromParam(
      "purchase_requests",
      "PRQ",
      id,
      "/purchase/purchase-requests",
      "",
      searchParams,
    ),
  );

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
