import { TrialPricingSettingsForm } from "@/components/settings/TrialPricingSettingsForm";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

/** アプリ設定 → 試算（SA05）の計算ロジック設定。 */
export default async function TrialEstimateSettingsPage() {
  const settings = await getTrialPricingSettings();
  return <TrialPricingSettingsForm initial={settings} />;
}
