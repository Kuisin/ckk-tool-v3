import { notFound } from "next/navigation";
import { DesignRequestDetail } from "@/components/sales/design-requests/DesignRequestDetail";
import { isIssuedDesign } from "@/components/sales/design-requests/model";
import { appLabelForKey } from "@/lib/app-list";
import { fetchApprovalState, fetchApprovalTrail } from "@/lib/approvals";
import { listAttachments } from "@/lib/attachments";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { listMemos } from "@/lib/document-memos";
import { pdfStorageKey, storedPdfMeta } from "@/lib/document-pdf";
import { formatDocPageTitle } from "@/lib/page-title";
import { getServerLocale } from "@/lib/user-preferences";
import { fetchDesignRequest, fetchEmployeeOptions } from "../data";

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
      appLabelForKey("design-requests", "設計依頼書", locale), // i18n-ignore — ja はそのまま使う（訳の実体は appLabelForKey 内の en/zh マップ）
      decodeURIComponent(id),
    ),
  };
}

/** 設計依頼書 詳細 (SA26). URL id = 依頼番号 DSG-YYYYMM-NNNNN. */
export default async function SalesDesignRequestsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("design-requests");
  if (denied) return denied;
  const { id } = await params;
  const requestNumber = decodeURIComponent(id);
  const locale = await getServerLocale();

  const [
    request,
    auditEntries,
    attachments,
    approval,
    approvalTrail,
    assigneeOptions,
    memos,
  ] = await Promise.all([
    fetchDesignRequest(requestNumber, locale),
    fetchAuditEntries("design_requests", requestNumber),
    listAttachments("design_requests", requestNumber),
    fetchApprovalState("design_requests", requestNumber),
    fetchApprovalTrail("design_requests", requestNumber),
    fetchEmployeeOptions(),
    listMemos("design_requests", requestNumber),
  ]);
  if (!request) notFound();

  // 承認前は PDF そのものを出さないので、保管メタも引かない。
  const pdfMeta = isIssuedDesign(request.status)
    ? await storedPdfMeta(pdfStorageKey.designRequest(request.requestNumber))
    : null;

  return (
    <DesignRequestDetail
      approval={approval}
      approvalTrail={approvalTrail}
      assigneeOptions={assigneeOptions}
      attachments={attachments}
      auditEntries={auditEntries}
      memos={memos}
      pdfMeta={pdfMeta}
      request={request}
    />
  );
}
