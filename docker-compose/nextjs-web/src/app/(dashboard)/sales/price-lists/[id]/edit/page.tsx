import { notFound } from "next/navigation";
import { PriceListTypeForm } from "@/components/sales/price-lists/PriceListTypeForm";
import { prisma } from "@/lib/db";
import { parseDocKey } from "@/lib/doc-number";
import { calcTrialPricing, type TrialInput } from "@/lib/trial-pricing";
import { fetchExistingEntryRefs } from "../../../trial-estimates/data";
import { fetchPriceEntry } from "../../data";

export const dynamic = "force-dynamic";

/** 価格表 編集 (SA21 → edit). `id` は価格表番号 PRC-YYYYMM-NNNNN. */
export default async function PriceListEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const key = parseDocKey(decodeURIComponent(id), "PRC");
  if (!key) notFound();

  const [entry, existingEntries] = await Promise.all([
    fetchPriceEntry(key),
    fetchExistingEntryRefs(),
  ]);
  if (!entry) notFound();

  // 試算元の見積単価（基準単価のロック値）— 試算リンクがあるときだけ。
  let estimateBase: number | null = null;
  const estKey = entry.estimateNumber
    ? parseDocKey(entry.estimateNumber, "EST")
    : null;
  if (estKey) {
    const estimate = await prisma.estimate.findUnique({
      where: {
        yearMonth_seq: { yearMonth: estKey.yearMonth, seq: estKey.seq },
      },
    });
    if (estimate) {
      estimateBase =
        calcTrialPricing(estimate.input as unknown as TrialInput).lots[0]
          ?.estimateUnitPrice ?? null;
    }
  }

  return (
    <PriceListTypeForm
      customerOption={{ value: entry.customerId, label: entry.customerName }}
      entry={entry}
      estimateBase={estimateBase}
      existingEntries={existingEntries}
      mode="edit"
      productOption={{ value: entry.productId, label: entry.productName }}
    />
  );
}
