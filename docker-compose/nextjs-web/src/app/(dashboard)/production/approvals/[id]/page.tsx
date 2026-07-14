import { notFound } from "next/navigation";
import { WorkOrderDetail } from "@/components/production/work-orders/WorkOrderDetail";
import { isApprover } from "@/lib/approvals";
import { fetchAuditEntries } from "@/lib/audit";
import {
  fetchWorkOrder,
  fetchWorkOrderApprovalTrail,
} from "../../work-orders/data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: `承認 #${decodeURIComponent(id)} | CKK 業務管理システム` };
}

/**
 * 承認 詳細 (PD23). URL id = 指示書番号。指示書詳細と同じデータを
 * ApprovalStatusPanel 中心のレイアウトで表示する。
 */
export default async function ProductionApprovalsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workOrderNumber = Number(id);
  if (!Number.isInteger(workOrderNumber) || workOrderNumber < 1) notFound();

  const [
    workOrder,
    auditEntries,
    canApproveFirst,
    canApproveSecond,
    approvalTrail,
  ] = await Promise.all([
    fetchWorkOrder(workOrderNumber),
    fetchAuditEntries("work_orders", String(workOrderNumber)),
    isApprover("FIRST"),
    isApprover("SECOND"),
    fetchWorkOrderApprovalTrail(workOrderNumber),
  ]);
  if (!workOrder) notFound();

  return (
    <WorkOrderDetail
      approvalTrail={approvalTrail}
      auditEntries={auditEntries}
      canApproveFirst={canApproveFirst}
      canApproveSecond={canApproveSecond}
      variant="approval"
      workOrder={workOrder}
    />
  );
}
