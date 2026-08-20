import { notFound } from "next/navigation";
import { OrderAcceptanceDetail } from "@/components/sales/order-acceptances/OrderAcceptanceDetail";
import { fetchApprovalState, fetchApprovalTrail } from "@/lib/approvals";
import { listAttachments } from "@/lib/attachments";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { formatDocNumber, parseDocKey } from "@/lib/doc-number";
import { listMemos } from "@/lib/document-memos";
import { fetchWorkLocationOptions } from "@/lib/work-locations";
import { fetchOrderAcceptance, fetchPlantOptions } from "../data";
import { checkAcceptancePrices } from "../price-check";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return {
    title: `注文請書 ${decodeURIComponent(id)} | CKK 業務管理システム`,
  };
}

/** 注文請書 詳細 (SA24). URL id = 表示番号（ORD-YYYYMM-NNNNN）. */
export default async function OrderLineAcceptancesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("order-acceptances");
  if (denied) return denied;
  const { id } = await params;
  const key = parseDocKey(decodeURIComponent(id), "ORD");
  if (!key) notFound();
  const number = formatDocNumber("ORD", key);

  const [
    acceptance,
    auditEntries,
    attachments,
    memos,
    approvalTrail,
    approval,
    plantOptions,
    workLocationOptions,
  ] = await Promise.all([
    fetchOrderAcceptance(key),
    fetchAuditEntries("order_acceptances", number),
    listAttachments("order_acceptances", number),
    listMemos("order_acceptances", number),
    fetchApprovalTrail("order_acceptances", number),
    fetchApprovalState("order_acceptances", number),
    fetchPlantOptions(),
    fetchWorkLocationOptions(),
  ]);
  if (!acceptance) notFound();

  // §2 価格照合（P0-8）— 保存済み明細と価格表の差異。確定済み・アーカイブ
  // 済みは照合対象外（当時の価格表と現在の価格表のドリフトで誤警告するため）。
  const priceCheck = ["DRAFT", "REQUESTED", "APPROVED"].includes(
    acceptance.status,
  )
    ? await checkAcceptancePrices(key)
    : { lines: [], diffCount: 0 };

  return (
    <OrderAcceptanceDetail
      acceptance={acceptance}
      approval={approval}
      approvalTrail={approvalTrail}
      attachments={attachments}
      auditEntries={auditEntries}
      memos={memos}
      plantOptions={plantOptions}
      priceCheck={priceCheck}
      workLocationOptions={workLocationOptions}
    />
  );
}
