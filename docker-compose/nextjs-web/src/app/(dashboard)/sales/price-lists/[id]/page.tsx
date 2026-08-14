import { notFound } from "next/navigation";
import { PriceListDetail } from "@/components/sales/price-lists/PriceListDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { parseDocKey } from "@/lib/doc-number";
import {
  fetchCustomerOptions,
  fetchProductOptions,
} from "../../trial-estimates/data";
import { fetchPriceEntry, fetchRelatedQuotes } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: `価格表 ${decodeURIComponent(id)} | CKK 業務管理システム` };
}

/** 価格表 詳細 (SA22). `id` は価格表番号 PRC-YYYYMM-NNNNN. */
export default async function PriceListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("price-lists");
  if (denied) return denied;
  const { id } = await params;
  const key = parseDocKey(decodeURIComponent(id), "PRC");
  if (!key) notFound();

  const entry = await fetchPriceEntry(key);
  if (!entry) notFound();

  const [relatedQuotes, customerOptions, productOptions, auditEntries] =
    await Promise.all([
      fetchRelatedQuotes(key),
      fetchCustomerOptions(),
      fetchProductOptions(),
      fetchAuditEntries("price_list_entries", entry.entryId),
    ]);

  return (
    <PriceListDetail
      auditEntries={auditEntries}
      customerOptions={customerOptions}
      entry={entry}
      productOptions={productOptions}
      relatedQuotes={relatedQuotes}
    />
  );
}
