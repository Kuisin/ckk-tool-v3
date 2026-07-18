import { notFound } from "next/navigation";
import { CriterionEditForm } from "@/components/settings/CriterionEditForm";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

/** 計算基準の個別編集ページ（SY02 サブ）。 */
export default async function CriterionEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const criterionId = decodeURIComponent(id);
  const settings = await getTrialPricingSettings();
  if (!settings.criteria.some((c) => c.id === criterionId)) notFound();
  return (
    <CriterionEditForm
      allCriteria={settings.criteria}
      correctionFactor={settings.correctionFactor}
      criterionId={criterionId}
      customInputs={settings.customInputs}
      ldChargePer10min={settings.ldChargePer10min}
      lookupTables={settings.lookupTables}
    />
  );
}
