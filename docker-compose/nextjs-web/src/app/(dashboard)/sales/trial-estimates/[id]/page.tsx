import { notFound } from "next/navigation";
import { TrialEstimateDetail } from "@/components/sales/trial-estimates/TrialEstimateDetail";
import type { LinkedPriceEntry } from "@/components/sales/trial-estimates/types";
import { fetchAuditEntries } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  formatEstimateNumber,
  formatPriceListNumber,
  formatProductNumber,
  parseDocKey,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { fetchPriceHistory } from "@/lib/material-pricing";
import {
  fetchCustomerOptions,
  fetchExistingEntryRefs,
  fetchProductOptions,
  fetchTrialEstimate,
} from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: `試算 ${decodeURIComponent(id)} | CKK 業務管理システム` };
}

/** 試算 詳細 (SA52). URL id = 導出文書番号 EST-YYYYMM-NNNNN. */
export default async function TrialEstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const key = parseDocKey(id, "EST");
  if (!key) notFound();

  const [
    record,
    customerOptions,
    productOptions,
    existingEntries,
    linked,
    auditEntries,
  ] = await Promise.all([
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
    fetchAuditEntries("estimates", formatEstimateNumber(key)),
  ]);
  if (!record) notFound();

  const priceHistory = record.materialId
    ? await fetchPriceHistory(Number(record.materialId))
    : [];

  const linkedEntries: LinkedPriceEntry[] = linked.map((e) => {
    const code = formatProductNumber(e.product.yearMonth, e.product.seq);
    const nm = localized(e.product.name as LocalizedText | null);
    return {
      entryId: formatPriceListNumber({ yearMonth: e.yearMonth, seq: e.seq }),
      customerName: localized(e.customerBp.name as LocalizedText | null),
      productName: code ? `${nm} ${code}` : nm,
      orderType: e.orderType,
      tierCount: e._count.tiers,
    };
  });

  return (
    <TrialEstimateDetail
      auditEntries={auditEntries}
      customerOptions={customerOptions}
      existingEntries={existingEntries}
      linkedEntries={linkedEntries}
      priceHistory={priceHistory}
      productOptions={productOptions}
      record={record}
    />
  );
}
