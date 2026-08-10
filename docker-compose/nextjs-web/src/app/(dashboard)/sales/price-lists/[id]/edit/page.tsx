import { notFound } from "next/navigation";
import { PriceListTypeForm } from "@/components/sales/price-lists/PriceListTypeForm";
import { parseDocKey } from "@/lib/doc-number";
import { fetchExistingEntryRefs } from "../../../trial-estimates/data";
import { fetchEstimateBases, fetchPriceEntry } from "../../data";

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

  // 各バリアントの試算元の見積単価（基準単価のロック値）。
  const estimateBases = await fetchEstimateBases(
    entry.variants.map((v) => v.estimateNumber).filter((n): n is string => !!n),
  );

  return (
    <PriceListTypeForm
      customerOption={{ value: entry.customerId, label: entry.customerName }}
      entry={entry}
      estimateBases={estimateBases}
      existingEntries={existingEntries}
      mode="edit"
      productOption={{ value: entry.productId, label: entry.productName }}
    />
  );
}
