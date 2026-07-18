import { TrialPricingEngineForm } from "@/components/settings/TrialPricingEngineForm";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

/** 試算計算（SY02）— 計算基準・カスタム入力・材料参照ポリシー・係数・カスタム計算 JS。 */
export default async function TrialPricingEnginePage() {
  const settings = await getTrialPricingSettings();
  return <TrialPricingEngineForm initial={settings} />;
}
