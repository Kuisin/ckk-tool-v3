import { notFound } from "next/navigation";
import { OrderAcceptanceDetail } from "@/components/sales/order-acceptances/OrderAcceptanceDetail";
import { fetchApprovalTrail, isApprover } from "@/lib/approvals";
import { listAttachments } from "@/lib/attachments";
import { fetchAuditEntries } from "@/lib/audit";
import { formatDocNumber, parseDocKey } from "@/lib/doc-number";
import { fetchOrderAcceptance } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return {
    title: `受注請書 ${decodeURIComponent(id)} | CKK 業務管理システム`,
  };
}

/** 受注請書 詳細 (SA23). URL id = 表示番号（ORD-YYYYMM-NNNNN）. */
export default async function SalesOrderAcceptancesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const key = parseDocKey(decodeURIComponent(id), "ORD");
  if (!key) notFound();
  const number = formatDocNumber("ORD", key);

  const [acceptance, auditEntries, attachments, approvalTrail, canApprove] =
    await Promise.all([
      fetchOrderAcceptance(key),
      fetchAuditEntries("order_acceptances", number),
      listAttachments("order_acceptances", number),
      fetchApprovalTrail("order_acceptances", number),
      isApprover("FIRST"),
    ]);
  if (!acceptance) notFound();

  return (
    <OrderAcceptanceDetail
      acceptance={acceptance}
      approvalTrail={approvalTrail}
      attachments={attachments}
      auditEntries={auditEntries}
      canApprove={canApprove}
    />
  );
}
