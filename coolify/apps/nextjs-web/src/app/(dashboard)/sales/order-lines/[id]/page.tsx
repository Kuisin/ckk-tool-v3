import { notFound } from "next/navigation";
import { OrderLineDetail } from "@/components/sales/order-lines/OrderLineDetail";
import { appLabelForKey } from "@/lib/app-list";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { formatOrderLineNumber, parseOrderLineKey } from "@/lib/doc-number";
import { listMemos } from "@/lib/document-memos";
import { formatDocPageTitle } from "@/lib/page-title";
import { getServerLocale } from "@/lib/user-preferences";
import { fetchDesignRequestsForOrderLine } from "../../design-requests/data";
import { fetchOrderLine } from "../data";

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
      appLabelForKey("order-lines", "注文明細", locale), // i18n-ignore — ja はそのまま使う（訳の実体は appLabelForKey 内の en/zh マップ）
      decodeURIComponent(id),
    ),
  };
}

/** 注文明細 詳細 (SA25). URL id = 導出文書番号 ORD-YYYYMM-NNNNN-NN. */
export default async function ProductionOrderLinesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("order-lines");
  if (denied) return denied;
  const { id } = await params;
  const key = parseOrderLineKey(decodeURIComponent(id));
  if (!key) notFound();

  const [order, auditEntries, memos] = await Promise.all([
    fetchOrderLine(key),
    fetchAuditEntries("order_lines", formatOrderLineNumber(key)),
    listMemos("order_lines", formatOrderLineNumber(key)),
  ]);
  if (!order) notFound();

  // §10 設計依頼は受注と並行する側枝 — 設計タブに逆リンクを出す。
  // 明細の uuid は fetchOrderLine の後でないと分からないので直列に引く。
  const designRequests = await fetchDesignRequestsForOrderLine(order.uuid);

  return (
    <OrderLineDetail
      auditEntries={auditEntries}
      designRequests={designRequests}
      memos={memos}
      order={order}
    />
  );
}
