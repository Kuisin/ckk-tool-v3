import { Stack } from "@mantine/core";
import { ToolTypesPanel } from "@/components/settings/ToolTypesPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

const ENGINE = "/settings/trial-pricing-engine";

/** 工具種管理（SY02）— 追加/削除と種ごとの適用基準サマリ。 */
export default async function ToolTypesPage() {
  const [settings, counts] = await Promise.all([
    getTrialPricingSettings(),
    prisma.estimate.groupBy({ by: ["toolType"], _count: { _all: true } }),
  ]);
  const usage = Object.fromEntries(
    counts.map((c) => [c.toolType, c._count._all]),
  );

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          "システム",
          { label: "試算計算", href: ENGINE },
          "工具種管理",
        ]}
        title="工具種管理"
      />
      <ToolTypesPanel
        criteria={settings.criteria}
        toolTypes={settings.toolTypes}
        usage={usage}
      />
    </Stack>
  );
}
