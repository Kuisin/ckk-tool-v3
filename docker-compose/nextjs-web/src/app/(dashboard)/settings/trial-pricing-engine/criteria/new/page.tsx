import { CriterionEditForm } from "@/components/settings/CriterionEditForm";
import { requireAppRead } from "@/lib/authz-page";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

/** 計算基準の新規追加ページ（SY02 サブ）。 */
export default async function CriterionNewPage() {
  const denied = await requireAppRead("trial-pricing-engine");
  if (denied) return denied;
  const settings = await getTrialPricingSettings();
  return (
    <CriterionEditForm
      allCriteria={settings.criteria}
      criterionId={null}
      customInputs={settings.customInputs}
      lookupTables={settings.lookupTables}
      toolTypes={settings.toolTypes}
    />
  );
}
