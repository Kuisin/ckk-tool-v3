import { notFound } from "next/navigation";
import { CriterionEditForm } from "@/components/settings/CriterionEditForm";
import { requireAppRead } from "@/lib/authz-page";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

/** 計算基準の個別編集ページ（SY02 サブ）。 */
export default async function CriterionEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("trial-pricing-engine");
  if (denied) return denied;
  const { id } = await params;
  const criterionId = decodeURIComponent(id);
  const settings = await getTrialPricingSettings();
  if (!settings.criteria.some((c) => c.id === criterionId)) notFound();
  return (
    <CriterionEditForm
      allCriteria={settings.criteria}
      criterionId={criterionId}
      customInputs={settings.customInputs}
      lookupTables={settings.lookupTables}
      toolTypes={settings.toolTypes}
    />
  );
}
