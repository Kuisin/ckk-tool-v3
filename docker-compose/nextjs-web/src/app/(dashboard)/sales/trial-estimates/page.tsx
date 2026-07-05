import { TrialEstimateTable } from "@/components/sales/trial-estimates/TrialEstimateTable";
import {
  fetchCustomerOptions,
  fetchExistingEntryRefs,
  fetchProductOptions,
  fetchTrialEstimates,
} from "./data";

export const dynamic = "force-dynamic";

/** 試算 一覧 (SA50). */
export default async function TrialEstimatesPage() {
  const [rows, customerOptions, productOptions, existingEntries] =
    await Promise.all([
      fetchTrialEstimates(),
      fetchCustomerOptions(),
      fetchProductOptions(),
      fetchExistingEntryRefs(),
    ]);

  return (
    <TrialEstimateTable
      customerOptions={customerOptions}
      existingEntries={existingEntries}
      productOptions={productOptions}
      rows={rows}
    />
  );
}
