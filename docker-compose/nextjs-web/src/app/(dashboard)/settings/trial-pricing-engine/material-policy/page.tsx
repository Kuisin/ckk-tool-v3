import { MaterialPolicyForm } from "@/components/settings/TrialPricingScalarForms";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

export default async function MaterialPolicyPage() {
  const settings = await getTrialPricingSettings();
  return <MaterialPolicyForm initial={settings} />;
}
