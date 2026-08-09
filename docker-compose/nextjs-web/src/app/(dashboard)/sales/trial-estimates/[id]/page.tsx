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
import { fetchPriceHistoryByType } from "@/lib/material-pricing";
import { getTrialPricingSettings } from "@/lib/system-settings";
import { toTrialPricingOptions } from "@/lib/trial-pricing-settings";
import { fetchTrialEstimate } from "../data";

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

  const [record, linked, auditEntries, settings] = await Promise.all([
    fetchTrialEstimate(key.yearMonth, key.seq),
    prisma.priceListVariant.findMany({
      where: { estimateYearMonth: key.yearMonth, estimateSeq: key.seq },
      include: {
        entry: { include: { customerBp: true, product: true } },
        _count: { select: { tiers: true } },
      },
    }),
    fetchAuditEntries("estimates", formatEstimateNumber(key)),
    getTrialPricingSettings(),
  ]);
  if (!record) notFound();

  const typeId = Number(record.materialTypeId);
  const priceHistory =
    Number.isInteger(typeId) &&
    typeId > 0 &&
    record.diameterCode &&
    record.surfaceFinishCode
      ? await fetchPriceHistoryByType({
          materialTypeId: typeId,
          diameterCode: record.diameterCode,
          surfaceFinishCode: record.surfaceFinishCode,
        })
      : [];

  const linkedEntries: LinkedPriceEntry[] = linked.map((v) => {
    const code = formatProductNumber(
      v.entry.product.yearMonth,
      v.entry.product.seq,
    );
    const nm = localized(v.entry.product.name as LocalizedText | null);
    return {
      entryId: formatPriceListNumber({
        yearMonth: v.entry.yearMonth,
        seq: v.entry.seq,
      }),
      customerName: localized(v.entry.customerBp.name as LocalizedText | null),
      productName: code ? `${nm} ${code}` : nm,
      orderType: v.orderType,
      tierCount: v._count.tiers,
    };
  });

  return (
    <TrialEstimateDetail
      auditEntries={auditEntries}
      linkedEntries={linkedEntries}
      priceHistory={priceHistory}
      pricingOptions={toTrialPricingOptions(settings)}
      record={record}
    />
  );
}
