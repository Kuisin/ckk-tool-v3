import { notFound } from "next/navigation";
import { PriceListTypeForm } from "@/components/sales/price-lists/PriceListTypeForm";
import { requireAppRead } from "@/lib/authz-page";
import { docKeyFromParam } from "@/lib/doc-param";
import { getScalePreset } from "@/lib/price-scale-preset-store";
import { fetchExistingEntryRefs } from "../../../trial-estimates/data";
import { fetchEstimateBases, fetchPriceEntry } from "../../data";

export const dynamic = "force-dynamic";

/** 価格表 編集 (SA22 → edit). `id` は法人コード付きの価格表番号（CKK~PRC-2026-00001）。 */
export default async function PriceListEditPage({
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
    "/edit",
    searchParams,
  );

  const [entry, existingEntries, scalePreset] = await Promise.all([
    fetchPriceEntry(key),
    fetchExistingEntryRefs(),
    getScalePreset(),
  ]);
  if (!entry) notFound();

  // 各バリアントの価格試算元の見積単価（基準単価のロック値）。
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
      productOption={{ value: entry.itemId, label: entry.productName }}
      scalePreset={scalePreset}
    />
  );
}
