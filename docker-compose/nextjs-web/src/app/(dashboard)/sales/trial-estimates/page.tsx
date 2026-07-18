import { TrialEstimateTable } from "@/components/sales/trial-estimates/TrialEstimateTable";
import { getTrialPricingSettings } from "@/lib/system-settings";
import { toTrialPricingOptions } from "@/lib/trial-pricing-settings";
import {
  fetchCustomerOptions,
  fetchExistingEntryRefs,
  fetchProductOptions,
  fetchTrialEstimates,
} from "./data";

export const dynamic = "force-dynamic";

/** 試算 一覧 (SA50). */
export default async function TrialEstimatesPage() {
  const [rows, customerOptions, productOptions, existingEntries, settings] =
    await Promise.all([
      fetchTrialEstimates(),
      fetchCustomerOptions(),
      fetchProductOptions(),
      fetchExistingEntryRefs(),
      getTrialPricingSettings(),
    ]);

  return (
    <TrialEstimateTable
      customerOptions={customerOptions}
      existingEntries={existingEntries}
      pricingOptions={toTrialPricingOptions(settings)}
      productOptions={productOptions}
      rows={rows}
    />
  );
}
