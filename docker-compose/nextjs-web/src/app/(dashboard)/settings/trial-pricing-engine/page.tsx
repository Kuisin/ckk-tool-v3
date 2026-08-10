import { Stack, Text } from "@mantine/core";
import {
  type TrialPricingHubSection,
  TrialPricingHubSections,
} from "@/components/settings/TrialPricingHubSections";
import { PageHeader } from "@/components/ui/PageHeader";
import { getTrialPricingSettings } from "@/lib/system-settings";
import { MATERIAL_PRICE_BASIS_OPTIONS } from "@/lib/trial-pricing-settings";

export const dynamic = "force-dynamic";

const BASE = "/settings/trial-pricing-engine";

/** 試算計算（SY02）— 各セクションを閲覧し、クリックで個別の編集ページへ。 */
export default async function TrialPricingEnginePage() {
  const s = await getTrialPricingSettings();
  const basisLabel =
    MATERIAL_PRICE_BASIS_OPTIONS.find((o) => o.value === s.materialPriceBasis)
      ?.label ?? s.materialPriceBasis;

  const sections: TrialPricingHubSection[] = [
    {
      key: "criteria",
      title: "計算基準",
      summary: `${s.criteria.length} 基準 — 見積単価は加算基準の合計`,
      href: `${BASE}/criteria`,
    },
    {
      key: "tool-types",
      title: "工具種管理",
      summary: `${s.toolTypes.length} 種 — 種ごとの適用基準と見積単価`,
      href: `${BASE}/tool-types`,
    },
    {
      key: "material-policy",
      title: "材料参照価格ポリシー",
      summary: `${basisLabel} / 参照 ${s.materialPriceLookbackMonths}ヶ月`,
      href: `${BASE}/material-policy`,
    },
    {
      key: "custom-inputs",
      title: "カスタム入力項目",
      summary: `${s.customInputs.length} 項目 — 見積入力とグローバル固定係数`,
      href: `${BASE}/custom-inputs`,
    },
    {
      key: "lookups",
      title: "ルックアップ表",
      summary: `${s.lookupTables.length} 表 — 径×全長マトリクス等を式内で参照`,
      href: `${BASE}/lookups`,
    },
  ];

  return (
    <Stack gap="md" maw={1000}>
      <PageHeader breadcrumbs={["システム", "試算計算"]} title="試算計算" />
      <Text c="dimmed" size="sm">
        各セクションを選ぶと編集ページが開きます。
      </Text>
      <TrialPricingHubSections sections={sections} />
    </Stack>
  );
}
