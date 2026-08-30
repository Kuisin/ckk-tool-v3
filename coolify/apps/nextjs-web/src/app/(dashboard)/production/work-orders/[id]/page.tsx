import { notFound } from "next/navigation";
import {
  fetchDesignFileById,
  fetchLatestViewableDesignFile,
} from "@/app/(dashboard)/production/design-files/data";
import { WorkOrderDetail } from "@/components/production/work-orders/WorkOrderDetail";
import { fetchApprovalState } from "@/lib/approvals";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
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

  // 現場が「何を見て作るか」。
  //
  // 図面は **(製品 × 受注元)** ごとに系列が分かれるので、この指示書の顧客を
  // 先に決めてから引く。指示書が版をピン留めしていれば、それが優先される
  // （人が明示的に選んだものが系列の優先規則に勝つ）。
  const woDesign = await prisma.workOrder.findUnique({
    where: { workOrderNumber },
    select: {
      productId: true,
      designFileId: true,
      orderLineLinks: {
        select: {
          orderLine: {
            select: { acceptance: { select: { customerBpId: true } } },
          },
        },
      },
    },
  });
  // 複数の注文明細を束ねた指示書は顧客が 1 人に定まらないことがある。
  // **定まるときだけ**その顧客の系列を見て、混在していれば汎用へ落とす
  // （どちらか一方の顧客の図面を勝手に選ぶと、もう一方が黙って間違う）。
  const woCustomers = [
    ...new Set(
      (woDesign?.orderLineLinks ?? [])
        .map((l) => l.orderLine.acceptance.customerBpId)
        .filter((v): v is string => v != null),
    ),
  ];
  const designCustomerBpId = woCustomers.length === 1 ? woCustomers[0] : null;
  const designFile = woDesign?.designFileId
    ? await fetchDesignFileById(woDesign.designFileId)
    : woDesign?.productId
      ? await fetchLatestViewableDesignFile(
          Number(woDesign.productId),
          designCustomerBpId,
        )
      : null;

  // 承認依頼中の工程フロー変更（承認設定が未設定の環境では常に null）。
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
      designFile={designFile}
      designPinned={woDesign?.designFileId != null}
      flowChange={pendingFlowChange}
      flowChangeApproval={flowChangeApproval}
      memos={memos}
      rejectedAppliedFlowChange={rejectedAppliedFlowChange}
      workOrder={workOrder}
    />
  );
}
