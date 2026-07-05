import { TrialEstimateForm } from "@/components/sales/trial-estimates/TrialEstimateForm";
import { parseDocKey } from "@/lib/doc-number";
import {
  fetchCustomerOptions,
  fetchMaterialOptions,
  fetchTrialEstimate,
} from "../data";

export const dynamic = "force-dynamic";

/** 試算 新規 (SA51). `?from=EST-…` で複製して再試算。 */
export default async function TrialEstimateNewPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const fromKey = from ? parseDocKey(from, "EST") : null;

  const [customerOptions, materialOptions, source] = await Promise.all([
    fetchCustomerOptions(),
    fetchMaterialOptions(),
    fromKey ? fetchTrialEstimate(fromKey.yearMonth, fromKey.seq) : null,
  ]);

  return (
    <TrialEstimateForm
      customerOptions={customerOptions}
      materialOptions={materialOptions}
      source={source}
    />
  );
}
