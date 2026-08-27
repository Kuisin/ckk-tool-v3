import { notFound } from "next/navigation";
import { DesignRequestDetail } from "@/components/sales/design-requests/DesignRequestDetail";
import { fetchApprovalState, fetchApprovalTrail } from "@/lib/approvals";
import { listAttachments } from "@/lib/attachments";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { fetchDesignRequest, fetchEmployeeOptions } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return {
    title: `設計依頼書 ${decodeURIComponent(id)} | CKK 業務管理システム`,
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

  const [
    request,
    auditEntries,
    attachments,
    approval,
    approvalTrail,
    assigneeOptions,
  ] = await Promise.all([
    fetchDesignRequest(requestNumber),
    fetchAuditEntries("design_requests", requestNumber),
    listAttachments("design_requests", requestNumber),
    fetchApprovalState("design_requests", requestNumber),
    fetchApprovalTrail("design_requests", requestNumber),
    fetchEmployeeOptions(),
  ]);
  if (!request) notFound();

  return (
    <DesignRequestDetail
      approval={approval}
      approvalTrail={approvalTrail}
      assigneeOptions={assigneeOptions}
      attachments={attachments}
      auditEntries={auditEntries}
      request={request}
    />
  );
}
