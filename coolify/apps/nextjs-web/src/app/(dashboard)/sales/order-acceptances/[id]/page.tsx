import { notFound } from "next/navigation";
import { OrderAcceptanceDetail } from "@/components/sales/order-acceptances/OrderAcceptanceDetail";
import { appLabelForKey } from "@/lib/app-list";
import { fetchApprovalState, fetchApprovalTrail } from "@/lib/approvals";
import { listAttachments } from "@/lib/attachments";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { formatDocNumber, parseDocKey } from "@/lib/doc-number";
import { listMemos } from "@/lib/document-memos";
import { fetchPendingAcceptanceCancel } from "@/lib/order-acceptance-cancel";
import { formatDocPageTitle } from "@/lib/page-title";
import { getServerLocale } from "@/lib/user-preferences";
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
  const locale = await getServerLocale();
  return {
    title: formatDocPageTitle(
      appLabelForKey("order-acceptances", "注文請書", locale), // i18n-ignore — ja はそのまま使う（訳の実体は appLabelForKey 内の en/zh マップ）
      decodeURIComponent(id),
    ),
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
    cancelRequest,
  ] = await Promise.all([
    fetchOrderAcceptance(key),
    fetchAuditEntries("order_acceptances", number),
    listAttachments("order_acceptances", number),
    listMemos("order_acceptances", number),
    fetchApprovalTrail("order_acceptances", number),
    fetchApprovalState("order_acceptances", number),
    fetchPlantOptions(),
    fetchWorkLocationOptions(),
    fetchPendingAcceptanceCancel(key),
  ]);
  if (!acceptance) notFound();
  // 保留中のキャンセル依頼があれば、その依頼自体の承認状態も引く
  const cancelApproval = cancelRequest
    ? await fetchApprovalState(
        "order_acceptance_cancel_requests",
        cancelRequest.id,
      )
    : null;

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
      cancelApproval={cancelApproval}
      cancelRequest={cancelRequest}
      memos={memos}
      plantOptions={plantOptions}
      priceCheck={priceCheck}
      workLocationOptions={workLocationOptions}
    />
  );
}
