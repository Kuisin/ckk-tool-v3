import { notFound } from "next/navigation";
import { WorkOrderDetail } from "@/components/production/work-orders/WorkOrderDetail";
import { fetchApprovalState } from "@/lib/approvals";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { listMemos } from "@/lib/document-memos";
import {
  fetchPendingFlowChange,
  fetchRejectedAppliedFlowChange,
} from "@/lib/work-order-flow-changes";
import {
  fetchCatalogStepOptions,
  fetchWorkOrder,
  fetchWorkOrderApprovalTrail,
  resolveWorkOrderIdParam,
} from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: `指示書 #${decodeURIComponent(id)} | CKK 業務管理システム` };
}

/** 指示書 詳細 (PD22). URL id = 指示書番号（通し連番 int = ロット番号）。 */
export default async function ProductionWorkOrdersDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("work-orders");
  if (denied) return denied;
  const { id } = await params;
  const workOrderNumber = await resolveWorkOrderIdParam(id);
  if (workOrderNumber == null) notFound();

  const [
    workOrder,
    auditEntries,
    approval,
    catalogOptions,
    approvalTrail,
    memos,
  ] = await Promise.all([
    fetchWorkOrder(workOrderNumber),
    fetchAuditEntries("work_orders", String(workOrderNumber)),
    fetchApprovalState("work_orders", String(workOrderNumber)),
    fetchCatalogStepOptions(),
    fetchWorkOrderApprovalTrail(workOrderNumber),
    listMemos("work_orders", String(workOrderNumber)),
  ]);
  if (!workOrder) notFound();

  // 承認待ちの工程フロー変更（承認設定が未設定の環境では常に null）。
  // 承認状態は「指示書」ではなく「変更そのもの」に付くので別で引く。
  const pendingFlowChange = await fetchPendingFlowChange(workOrder.id);
  const flowChangeApproval = pendingFlowChange
    ? await fetchApprovalState("work_order_flow_changes", pendingFlowChange.id)
    : null;
  // 事後承認（POST）で差し戻されたが適用済み・未確認の変更（赤アラート）。
  const rejectedAppliedFlowChange = await fetchRejectedAppliedFlowChange(
    workOrder.id,
  );

  return (
    <WorkOrderDetail
      approval={approval}
      approvalTrail={approvalTrail}
      auditEntries={auditEntries}
      catalogOptions={catalogOptions}
      flowChange={pendingFlowChange}
      flowChangeApproval={flowChangeApproval}
      memos={memos}
      rejectedAppliedFlowChange={rejectedAppliedFlowChange}
      workOrder={workOrder}
    />
  );
}
