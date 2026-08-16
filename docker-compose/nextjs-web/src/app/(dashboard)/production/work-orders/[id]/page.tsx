import { notFound } from "next/navigation";
import { WorkOrderDetail } from "@/components/production/work-orders/WorkOrderDetail";
import { isApprover } from "@/lib/approvals";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { listMemos } from "@/lib/document-memos";
import {
  fetchCatalogStepOptions,
  fetchWorkOrder,
  fetchWorkOrderApprovalTrail,
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
  const workOrderNumber = Number(id);
  if (!Number.isInteger(workOrderNumber) || workOrderNumber < 1) notFound();

  const [
    workOrder,
    auditEntries,
    canApproveFirst,
    canApproveSecond,
    catalogOptions,
    approvalTrail,
    memos,
  ] = await Promise.all([
    fetchWorkOrder(workOrderNumber),
    fetchAuditEntries("work_orders", String(workOrderNumber)),
    isApprover("FIRST"),
    isApprover("SECOND"),
    fetchCatalogStepOptions(),
    fetchWorkOrderApprovalTrail(workOrderNumber),
    listMemos("work_orders", String(workOrderNumber)),
  ]);
  if (!workOrder) notFound();

  return (
    <WorkOrderDetail
      approvalTrail={approvalTrail}
      auditEntries={auditEntries}
      canApproveFirst={canApproveFirst}
      canApproveSecond={canApproveSecond}
      catalogOptions={catalogOptions}
      memos={memos}
      workOrder={workOrder}
    />
  );
}
