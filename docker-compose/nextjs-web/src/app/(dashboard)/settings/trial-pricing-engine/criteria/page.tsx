import { Stack } from "@mantine/core";
import { CriteriaListPanel } from "@/components/settings/CriteriaListPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

/** 計算基準の一覧（SY02）。並び替え・有効/無効・削除・追加。式編集は各行から。 */
export default async function CriteriaListPage() {
  const settings = await getTrialPricingSettings();
  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          "システム",
          { label: "試算計算", href: "/settings/trial-pricing-engine" },
          "計算基準",
        ]}
        title="計算基準"
      />
      <CriteriaListPanel initial={settings.criteria} />
    </Stack>
  );
}
