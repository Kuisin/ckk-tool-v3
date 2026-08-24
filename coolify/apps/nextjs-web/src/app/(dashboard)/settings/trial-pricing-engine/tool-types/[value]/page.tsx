import { notFound } from "next/navigation";
import { ToolTypeEditForm } from "@/components/settings/ToolTypeEditForm";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

/** 工具種の適用基準 編集（右ペイン）。ページヘッダーは layout の shell が持つ。 */
export default async function ToolTypeEditPage({
  params,
}: {
  params: Promise<{ value: string }>;
}) {
  const denied = await requireAppRead("trial-pricing-engine");
  if (denied) return denied;
  const { value: raw } = await params;
  const value = decodeURIComponent(raw);
  const settings = await getTrialPricingSettings();
  const toolType = settings.toolTypes.find((t) => t.value === value);
  if (!toolType) notFound();

  const usageCount = await prisma.estimate.count({
    where: { toolType: value },
  });

  return (
    <ToolTypeEditForm
      criteria={settings.criteria}
      toolType={toolType}
      usageCount={usageCount}
    />
  );
}
