import { TrialEstimateForm } from "@/components/sales/trial-estimates/TrialEstimateForm";
import { parseDocKey } from "@/lib/doc-number";
import {
  fetchMaterialTypeDefaultPrice,
  fetchPriceHistoryByType,
  type MaterialTypeKey,
} from "@/lib/material-pricing";
import { computeReferencePrice } from "@/lib/material-pricing-core";
import { getTrialPricingSettings } from "@/lib/system-settings";
import {
  fetchCustomerOptions,
  fetchDiameterOptions,
  fetchMaterialTypeOptions,
  fetchSurfaceFinishOptions,
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

  const [
    customerOptions,
    materialTypeOptions,
    diameterOptions,
    surfaceFinishOptions,
    source,
    settings,
  ] = await Promise.all([
    fetchCustomerOptions(),
    fetchMaterialTypeOptions(),
    fetchDiameterOptions(),
    fetchSurfaceFinishOptions(),
    fromKey ? fetchTrialEstimate(fromKey.yearMonth, fromKey.seq) : null,
    getTrialPricingSettings(),
  ]);

  // 複製元が材種構成を持つときのみ仕入実績＋既定単価を取得。新規はフォームで
  // 材種構成が揃った時点でクライアントから再取得する。
  const typeId = Number(source?.materialTypeId ?? "");
  const key: MaterialTypeKey | null =
    Number.isInteger(typeId) &&
    typeId > 0 &&
    source?.diameterCode &&
    source?.surfaceFinishCode
      ? {
          materialTypeId: typeId,
          diameterCode: source.diameterCode,
          surfaceFinishCode: source.surfaceFinishCode,
        }
      : null;
  const [history, typeDefault] = await Promise.all([
    key ? fetchPriceHistoryByType(key) : Promise.resolve([]),
    key ? fetchMaterialTypeDefaultPrice(key) : Promise.resolve(0),
  ]);
  const initialPricing = {
    history,
    reference: computeReferencePrice(
      history,
      settings.materialPriceBasis,
      settings.materialPriceLookbackMonths,
      undefined,
      typeDefault > 0 ? typeDefault : settings.defaultMaterialPrice,
    ),
  };

  return (
    <TrialEstimateForm
      customerOptions={customerOptions}
      diameterOptions={diameterOptions}
      initialPricing={initialPricing}
      materialTypeOptions={materialTypeOptions}
      settings={settings}
      source={source}
      surfaceFinishOptions={surfaceFinishOptions}
    />
  );
}
