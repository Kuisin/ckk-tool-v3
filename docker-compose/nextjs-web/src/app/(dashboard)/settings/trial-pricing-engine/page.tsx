import { Card, Group, Stack, Text, Title } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
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

  const sections: { title: string; summary: string; href: string }[] = [
    {
      title: "計算基準",
      summary: `${s.criteria.length} 基準（見積単価 = 加算基準の合計 → final）`,
      href: `${BASE}/criteria`,
    },
    {
      title: "材料参照価格ポリシー",
      summary: `${basisLabel} / 参照 ${s.materialPriceLookbackMonths}ヶ月`,
      href: `${BASE}/material-policy`,
    },
    {
      title: "既定値・係数",
      summary: `加工 ¥${s.machiningRatePer10min.toLocaleString()}/10分 · 補正 ${s.correctionFactor} · LD ¥${s.ldChargePer10min.toLocaleString()}/10分 · 予備 ${s.spareShapeCount}`,
      href: `${BASE}/coefficients`,
    },
    {
      title: "カスタム入力項目",
      summary: `${s.customInputs.length} 項目（試算フォームに表示・式の変数）`,
      href: `${BASE}/custom-inputs`,
    },
    {
      title: "ルックアップ表",
      summary: `${s.lookupTables.length} 表（式内で lookup("表名", キー)）`,
      href: `${BASE}/lookups`,
    },
  ];

  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={["システム", "試算計算"]} title="試算計算" />
      <Text c="dimmed" size="sm">
        各セクションを選ぶと編集ページが開きます。
      </Text>
      <Stack gap="sm">
        {sections.map((sec) => (
          <Card
            component="a"
            href={sec.href}
            key={sec.href}
            padding="md"
            radius="md"
            withBorder
          >
            <Group justify="space-between" wrap="nowrap">
              <Stack gap={2} style={{ minWidth: 0 }}>
                <Title order={5}>{sec.title}</Title>
                <Text c="dimmed" size="sm" truncate>
                  {sec.summary}
                </Text>
              </Stack>
              <IconChevronRight size={18} style={{ flexShrink: 0 }} />
            </Group>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
