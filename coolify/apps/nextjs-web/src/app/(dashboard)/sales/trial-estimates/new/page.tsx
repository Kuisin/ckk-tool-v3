import { TrialEstimateForm } from "@/components/sales/trial-estimates/TrialEstimateForm";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { issuingCompanyFieldForSession } from "@/lib/doc-company";
import { parseDocKey } from "@/lib/doc-number";
import {
  ESTIMATE_COST_PERMISSION,
  type EstimateKind,
  withoutCost,
  withoutCostFlags,
} from "@/lib/estimate-cost";
import {
  fetchMaterialTypeDefaultPrice,
  fetchPriceHistoryByType,
  type MaterialTypeKey,
} from "@/lib/material-pricing";
import { computeReferencePrice } from "@/lib/material-pricing-core";
import { getScalePreset } from "@/lib/price-scale-preset-store";
import { getTrialPricingSettings } from "@/lib/system-settings";
import {
  fetchCustomerOptions,
  fetchDiameterOptions,
  fetchMaterialTypeOptions,
  fetchSurfaceFinishOptions,
  fetchTrialEstimate,
} from "../data";

export const dynamic = "force-dynamic";

/**
 * 価格試算 新規 (SA51). `?from=EST-…` で複製して作り直す。
 * `?kind=PRICE|COST` で種別の初期値を決める — 原価試算の詳細の「売価試算を作成」は
 * `?from=<原価試算>&kind=PRICE` で入力を複写した売価試算を開く。
 */
export default async function TrialEstimateNewPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; kind?: string }>;
}) {
  const denied = await requireAppRead("trial-estimates");
  if (denied) return denied;
  const { from, kind } = await searchParams;
  const initialKind =
    kind === "COST" || kind === "PRICE" ? (kind as EstimateKind) : undefined;
  const fromKey = from ? parseDocKey(from, "EST") : null;

  const [
    customerOptions,
    materialTypeOptions,
    diameterOptions,
    surfaceFinishOptions,
    source,
    settings,
    scalePreset,
    costAuthz,
  ] = await Promise.all([
    fetchCustomerOptions(),
    fetchMaterialTypeOptions(),
    fetchDiameterOptions(),
    fetchSurfaceFinishOptions(),
    fromKey ? fetchTrialEstimate(fromKey.yearMonth, fromKey.seq) : null,
    getTrialPricingSettings(),
    getScalePreset(),
    checkPermission(ESTIMATE_COST_PERMISSION, "READ"),
  ]);
  // 原価を見られない人には、画面の行を消すだけでなく値ごと渡さない。
  const canViewCost = costAuthz.ok;

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

  const issuingCompany = await issuingCompanyFieldForSession();

  return (
    <TrialEstimateForm
      canViewCost={canViewCost}
      customerOptions={customerOptions}
      diameterOptions={diameterOptions}
      initialKind={initialKind}
      initialPricing={initialPricing}
      issuingCompany={issuingCompany}
      materialTypeOptions={materialTypeOptions}
      scalePreset={scalePreset}
      settings={
        canViewCost
          ? settings
          : { ...settings, criteria: withoutCostFlags(settings.criteria) }
      }
      source={
        canViewCost || !source?.resultSnapshot
          ? source
          : { ...source, resultSnapshot: withoutCost(source.resultSnapshot) }
      }
      surfaceFinishOptions={surfaceFinishOptions}
    />
  );
}
