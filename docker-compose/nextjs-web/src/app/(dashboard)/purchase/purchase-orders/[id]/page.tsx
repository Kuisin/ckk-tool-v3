import { notFound } from "next/navigation";
import { PurchaseOrderDetail } from "@/components/purchase/purchase-orders/PurchaseOrderDetail";
import { fetchApprovalTrail, isApprover } from "@/lib/approvals";
import { listAttachments } from "@/lib/attachments";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { fetchPurchaseOrder } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return {
    title: `素材発注書 ${decodeURIComponent(id)} | CKK 業務管理システム`,
  };
}

/** 素材発注書 詳細 (PU22). URL id = po_number（PO-YYYYMM-NNNNN）. */
export default async function PurchasePurchaseOrdersDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("purchase-orders");
  if (denied) return denied;
  const { id } = await params;
  const poNumber = decodeURIComponent(id);

  const [purchaseOrder, auditEntries, canApprove, attachments, approvalTrail] =
    await Promise.all([
      fetchPurchaseOrder(poNumber),
      fetchAuditEntries("material_purchase_orders", poNumber),
      isApprover("FIRST"),
      listAttachments("material_purchase_orders", poNumber),
      fetchApprovalTrail("material_purchase_orders", poNumber),
    ]);
  if (!purchaseOrder) notFound();

  return (
    <PurchaseOrderDetail
      approvalTrail={approvalTrail}
      attachments={attachments}
      auditEntries={auditEntries}
      canApprove={canApprove}
      purchaseOrder={purchaseOrder}
    />
  );
}
