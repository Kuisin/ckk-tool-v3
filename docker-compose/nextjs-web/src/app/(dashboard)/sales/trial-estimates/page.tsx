import { TrialEstimateTable } from "@/components/sales/trial-estimates/TrialEstimateTable";
import { getTrialPricingSettings } from "@/lib/system-settings";
import { toTrialPricingOptions } from "@/lib/trial-pricing-settings";
import { fetchTrialEstimates } from "./data";

export const dynamic = "force-dynamic";

/** 試算 一覧 (SA50). */
export default async function TrialEstimatesPage() {
  const [rows, settings] = await Promise.all([
    fetchTrialEstimates(),
    getTrialPricingSettings(),
  ]);

  return (
    <TrialEstimateTable
      pricingOptions={toTrialPricingOptions(settings)}
      rows={rows}
    />
  );
}
