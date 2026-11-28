import { notFound } from "next/navigation";
import { PriceListDetail } from "@/components/sales/price-lists/PriceListDetail";
import { appLabelForKey } from "@/lib/app-list";
import { fetchApprovalState, fetchApprovalTrail } from "@/lib/approvals";
import { fetchAuditEntries } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { docNo } from "@/lib/doc-number";
import { docKeyFromParam } from "@/lib/doc-param";
import { listMemos } from "@/lib/document-memos";
import { formatDocPageTitle } from "@/lib/page-title";
import { getServerLocale } from "@/lib/user-preferences";
import { fetchCustomerOptions } from "../../trial-estimates/data";
import {
  fetchCounterpartEntries,
  fetchPriceEntry,
  fetchPriceListItemOptions,
  fetchRelatedQuotes,
} from "../data";

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
      appLabelForKey("price-lists", "価格表", locale), // i18n-ignore — ja はそのまま使う（訳の実体は appLabelForKey 内の en/zh マップ）
      docNo(decodeURIComponent(id)),
    ),
  };
}

/** 価格表 詳細 (SA22). `id` は法人コード付きの価格表番号（CKK~PRC-2026-00001）。 */
export default async function PriceListDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await requireAppRead("price-lists");
  if (denied) return denied;
  const { id } = await params;
  const key = await docKeyFromParam(
    "price_list_entries",
    "PRC",
    id,
    "/sales/price-lists",
    "",
    searchParams,
  );

  const entry = await fetchPriceEntry(key);
  if (!entry) notFound();

  const [
    relatedQuotes,
    customerOptions,
    productOptions,
    auditEntries,
    memos,
    approval,
    approvalTrail,
    counterparts,
    canUpdate,
  ] = await Promise.all([
    fetchRelatedQuotes(key),
    fetchCustomerOptions(),
    fetchPriceListItemOptions(),
    fetchAuditEntries("price_list_entries", entry.entryId),
    listMemos("price_list_entries", entry.entryId),
    // 独自値の追加承認（価格試算から引き継いでいない価格があるときだけ）
    fetchApprovalState("price_list_entries", entry.entryId),
    fetchApprovalTrail("price_list_entries", entry.entryId),
    // 他社の価格表（同じ顧客 × 品目 × 工具・別の発行会社）との突き合わせ
    fetchCounterpartEntries(entry),
    checkPermission("price_list", "UPDATE"),
  ]);

  return (
    <PriceListDetail
      approval={approval}
      approvalTrail={approvalTrail}
      auditEntries={auditEntries}
      canSync={canUpdate.ok}
      counterparts={counterparts}
      customerOptions={customerOptions}
      entry={entry}
      memos={memos}
      productOptions={productOptions}
      relatedQuotes={relatedQuotes}
    />
  );
}
