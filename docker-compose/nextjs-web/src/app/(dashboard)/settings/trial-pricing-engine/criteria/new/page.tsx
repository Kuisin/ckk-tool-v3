import { CriterionEditForm } from "@/components/settings/CriterionEditForm";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

/** 計算基準の新規追加ページ（SY02 サブ）。 */
export default async function CriterionNewPage() {
  const settings = await getTrialPricingSettings();
  return (
    <CriterionEditForm
      allCriteria={settings.criteria}
      correctionFactor={settings.correctionFactor}
      criterionId={null}
      customInputs={settings.customInputs}
      ldChargePer10min={settings.ldChargePer10min}
    />
  );
}
