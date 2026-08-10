import { Stack } from "@mantine/core";
import { notFound } from "next/navigation";
import { ToolTypeEditForm } from "@/components/settings/ToolTypeEditForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

const ENGINE = "/settings/trial-pricing-engine";

/** 工具種の適用基準 編集（SY02 工具種管理のサブページ）。 */
export default async function ToolTypeEditPage({
  params,
}: {
  params: Promise<{ value: string }>;
}) {
  const { value: raw } = await params;
  const value = decodeURIComponent(raw);
  const settings = await getTrialPricingSettings();
  const toolType = settings.toolTypes.find((t) => t.value === value);
  if (!toolType) notFound();

  const usageCount = await prisma.estimate.count({
    where: { toolType: value },
  });

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          "システム",
          { label: "試算計算", href: ENGINE },
          { label: "工具種管理", href: `${ENGINE}/tool-types` },
          toolType.label,
        ]}
        title={`工具種: ${toolType.label}`}
      />
      <ToolTypeEditForm
        criteria={settings.criteria}
        toolType={toolType}
        usageCount={usageCount}
      />
    </Stack>
  );
}
