import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PurchaseOrderDetail } from "@/components/purchase/purchase-orders/PurchaseOrderDetail";
import { appLabelForKey } from "@/lib/app-list";
import { fetchApprovalState, fetchApprovalTrail } from "@/lib/approvals";
import { listAttachments } from "@/lib/attachments";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { formatDocPageTitle } from "@/lib/page-title";
import { getServerLocale } from "@/lib/user-preferences";
import { fetchReceiptsForPurchaseOrder } from "../../material-receipts/data";
import { fetchPurchaseOrder } from "../data";

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
      appLabelForKey("purchase-orders", "素材発注書", locale), // i18n-ignore — ja はそのまま使う（訳の実体は appLabelForKey 内の en/zh マップ）
      decodeURIComponent(id),
    ),
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
  const tr = await getTranslations();

  const [purchaseOrder, auditEntries, approval, attachments, approvalTrail] =
    await Promise.all([
      fetchPurchaseOrder(poNumber, tr),
      fetchAuditEntries("material_purchase_orders", poNumber),
      fetchApprovalState("material_purchase_orders", poNumber),
      listAttachments("material_purchase_orders", poNumber),
      fetchApprovalTrail("material_purchase_orders", poNumber),
    ]);
  if (!purchaseOrder) notFound();

  // 入荷は発注書の uuid で引くので、発注書を取ってからの 2 段目。
  const receipts = await fetchReceiptsForPurchaseOrder(purchaseOrder.id);

  return (
    <PurchaseOrderDetail
      approval={approval}
      approvalTrail={approvalTrail}
      attachments={attachments}
      auditEntries={auditEntries}
      purchaseOrder={purchaseOrder}
      receipts={receipts}
    />
  );
}
