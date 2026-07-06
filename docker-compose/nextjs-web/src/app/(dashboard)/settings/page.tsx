import { TrialPricingSettingsForm } from "@/components/settings/TrialPricingSettingsForm";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

/** システム設定 — 試算 価格ポリシー等（app.system_settings）. */
export default async function SettingsPage() {
  const settings = await getTrialPricingSettings();
  return <TrialPricingSettingsForm initial={settings} />;
}
