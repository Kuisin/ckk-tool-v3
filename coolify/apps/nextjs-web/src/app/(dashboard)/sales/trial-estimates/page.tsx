import { getTranslations } from "next-intl/server";
import { TrialEstimateTable } from "@/components/sales/trial-estimates/TrialEstimateTable";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import {
  ESTIMATE_COST_PERMISSION,
  withoutCost,
  withoutCostFlags,
} from "@/lib/estimate-cost";
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
  const [rows, settings, tr, costAuthz] = await Promise.all([
    fetchTrialEstimates(),
    getTrialPricingSettings(),
    getTranslations(),
    checkPermission(ESTIMATE_COST_PERMISSION, "READ"),
  ]);
  // 原価は権限の無い人にはサーバーから出さない（詳細ページと同じ規則）。
  // 一覧は client component に全行の結果スナップショットを渡すので、
  // ここで落とさないと RSC ペイロードにそのまま載る。
  const canViewCost = costAuthz.ok;
  const pricingOptions = toTrialPricingOptions(settings);

  return (
    <TrialEstimateTable
      pricingOptions={
        canViewCost
          ? pricingOptions
          : {
              ...pricingOptions,
              criteria: pricingOptions.criteria
                ? withoutCostFlags(pricingOptions.criteria)
                : undefined,
            }
      }
      rows={
        canViewCost
          ? rows
          : rows.map((r) =>
              r.resultSnapshot
                ? { ...r, resultSnapshot: withoutCost(r.resultSnapshot) }
                : r,
            )
      }
      toolTypeOptions={toToolTypeOptions(settings, tr)}
    />
  );
}
