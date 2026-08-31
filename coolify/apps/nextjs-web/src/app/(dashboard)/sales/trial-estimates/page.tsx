import { TrialEstimateTable } from "@/components/sales/trial-estimates/TrialEstimateTable";
import { requireAppRead } from "@/lib/authz-page";
import { getTrialPricingSettings } from "@/lib/system-settings";
import {
  toToolTypeOptions,
  toTrialPricingOptions,
} from "@/lib/trial-pricing-settings";
import { fetchTrialEstimates } from "./data";

export const dynamic = "force-dynamic";

/** 価格試算 一覧 (SA50). */
export default async function TrialEstimatesPage() {
  const denied = await requireAppRead("trial-estimates");
  if (denied) return denied;
  const [rows, settings] = await Promise.all([
    fetchTrialEstimates(),
    getTrialPricingSettings(),
  ]);

  return (
    <TrialEstimateTable
      pricingOptions={toTrialPricingOptions(settings)}
      rows={rows}
      toolTypeOptions={toToolTypeOptions(settings)}
    />
  );
}
