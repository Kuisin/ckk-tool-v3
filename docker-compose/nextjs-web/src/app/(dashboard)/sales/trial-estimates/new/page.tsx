import { TrialEstimateForm } from "@/components/sales/trial-estimates/TrialEstimateForm";
import { parseDocKey } from "@/lib/doc-number";
import { fetchPriceHistory } from "@/lib/material-pricing";
import { computeReferencePrice } from "@/lib/material-pricing-core";
import { getTrialPricingSettings } from "@/lib/system-settings";
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

  const [customerOptions, materialOptions, source, settings] =
    await Promise.all([
      fetchCustomerOptions(),
      fetchMaterialOptions(),
      fromKey ? fetchTrialEstimate(fromKey.yearMonth, fromKey.seq) : null,
      getTrialPricingSettings(),
    ]);

  // 初期素材（複製元 or 先頭の素材）の仕入実績＋ポリシー参照価格。
  const initialMaterialId = Number(
    source?.materialId || (materialOptions[0]?.value ?? ""),
  );
  const history =
    Number.isInteger(initialMaterialId) && initialMaterialId > 0
      ? await fetchPriceHistory(initialMaterialId)
      : [];
  const initialPricing = {
    history,
    reference: computeReferencePrice(
      history,
      settings.materialPriceBasis,
      settings.materialPriceLookbackMonths,
    ),
  };

  return (
    <TrialEstimateForm
      customerOptions={customerOptions}
      initialPricing={initialPricing}
      materialOptions={materialOptions}
      settings={settings}
      source={source}
    />
  );
}
