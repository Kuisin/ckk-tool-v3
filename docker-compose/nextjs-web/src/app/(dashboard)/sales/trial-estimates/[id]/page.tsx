import { notFound } from "next/navigation";
import { TrialEstimateDetail } from "@/components/sales/trial-estimates/TrialEstimateDetail";
import type { LinkedPriceEntry } from "@/components/sales/trial-estimates/types";
import { prisma } from "@/lib/db";
import { parseDocKey, priceEntryKey } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import {
  fetchCustomerOptions,
  fetchExistingEntryRefs,
  fetchProductOptions,
  fetchTrialEstimate,
} from "../data";

export const dynamic = "force-dynamic";

/** 試算 詳細 (SA52). URL id = 導出文書番号 EST-YYYYMM-NNNNN. */
export default async function TrialEstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const key = parseDocKey(id, "EST");
  if (!key) notFound();

  const [record, customerOptions, productOptions, existingEntries, linked] =
    await Promise.all([
      fetchTrialEstimate(key.yearMonth, key.seq),
      fetchCustomerOptions(),
      fetchProductOptions(),
      fetchExistingEntryRefs(),
      prisma.priceListEntry.findMany({
        where: { estimateYearMonth: key.yearMonth, estimateSeq: key.seq },
        include: {
          customerBp: true,
          product: true,
          _count: { select: { tiers: true } },
        },
      }),
    ]);
  if (!record) notFound();

  const linkedEntries: LinkedPriceEntry[] = linked.map((e) => ({
    entryId: priceEntryKey(e.customerBpId, e.productId, e.orderType),
    customerName: localized(e.customerBp.name as LocalizedText | null),
    productName: `${localized(e.product.name as LocalizedText | null)} ${e.productId}`,
    orderType: e.orderType,
    tierCount: e._count.tiers,
  }));

  return (
    <TrialEstimateDetail
      customerOptions={customerOptions}
      existingEntries={existingEntries}
      linkedEntries={linkedEntries}
      productOptions={productOptions}
      record={record}
    />
  );
}
