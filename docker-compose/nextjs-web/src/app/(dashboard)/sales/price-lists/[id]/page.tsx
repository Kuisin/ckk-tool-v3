import { notFound } from "next/navigation";
import type { EntryOrderType } from "@/components/sales/price-lists/model";
import { PriceListDetail } from "@/components/sales/price-lists/PriceListDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { parseDocKey } from "@/lib/doc-number";
import {
  fetchCustomerOptions,
  fetchProductOptions,
} from "../../trial-estimates/data";
import { fetchPriceEntry, fetchRelatedQuotes } from "../data";

export const dynamic = "force-dynamic";

/** 価格表 詳細 (SA21). `id` は価格表番号 PRC-YYYYMM-NNNNN. */
export default async function PriceListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const key = parseDocKey(decodeURIComponent(id), "PRC");
  if (!key) notFound();

  const entry = await fetchPriceEntry(key);
  if (!entry) notFound();

  const [
    relatedQuotes,
    siblingRows,
    customerOptions,
    productOptions,
    auditEntries,
  ] = await Promise.all([
    fetchRelatedQuotes(key),
    prisma.priceListEntry.findMany({
      where: {
        customerBpId: entry.customerId,
        productId: Number(entry.productId),
        NOT: { orderType: entry.orderType as EntryOrderType },
      },
      select: { orderType: true },
    }),
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
      siblings={siblingRows.map((s) => s.orderType)}
    />
  );
}
