import { Stack, Text } from "@mantine/core";
import { getTranslations } from "next-intl/server";
import {
  type TrialPricingHubSection,
  TrialPricingHubSections,
} from "@/components/settings/TrialPricingHubSections";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAppRead } from "@/lib/authz-page";
import { getTrialPricingSettings } from "@/lib/system-settings";
import { materialPriceBasisOptions } from "@/lib/trial-pricing-settings";

export const dynamic = "force-dynamic";

const BASE = "/settings/trial-pricing-engine";

/** 価格試算計算（SY02）— 各セクションを閲覧し、クリックで個別の編集ページへ。 */
export default async function TrialPricingEnginePage() {
  const tr = await getTranslations();
  const denied = await requireAppRead("trial-pricing-engine");
  if (denied) return denied;
  const s = await getTrialPricingSettings();
  const basisLabel =
    materialPriceBasisOptions(tr).find((o) => o.value === s.materialPriceBasis)
      ?.label ?? s.materialPriceBasis;

  const sections: TrialPricingHubSection[] = [
    {
      key: "criteria",
      title: tr("common.calculationBasis"),
      summary: `${s.criteria.length} 基準 — 見積単価は加算基準の合計`,
      href: `${BASE}/criteria`,
    },
    {
      key: "tool-types",
      title: tr("common.toolTypes"),
      summary: `${s.toolTypes.length} 種 — 種ごとの適用基準と見積単価`,
      href: `${BASE}/tool-types`,
    },
    {
      key: "material-policy",
      title: tr("common.materialReferencePricePolicy"),
      summary: `${basisLabel} / 参照 ${s.materialPriceLookbackMonths}ヶ月`,
      href: `${BASE}/material-policy`,
    },
    {
      key: "custom-inputs",
      title: tr("common.customInputs"),
      summary: `${s.customInputs.length} 項目 — 見積入力とグローバル固定係数`,
      href: `${BASE}/custom-inputs`,
    },
    {
      key: "lookups",
      title: tr("common.lookupTable"),
      summary: `${s.lookupTables.length} 表 — 径×全長マトリクス等を式内で参照`,
      href: `${BASE}/lookups`,
    },
  ];

  return (
    <Stack gap="md" maw={1000}>
      <PageHeader
        breadcrumbs={[tr("common.system"), tr("common.priceEstimateEngine")]}
        title={tr("common.priceEstimateEngine")}
      />
      <Text c="dimmed" size="sm">
        {tr("settings.trialPricingEngine.selectingASectionOpensItsEdit")}
      </Text>
      <TrialPricingHubSections sections={sections} />
    </Stack>
  );
}
