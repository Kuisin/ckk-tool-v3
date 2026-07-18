import { CoefficientsForm } from "@/components/settings/TrialPricingScalarForms";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

export default async function CoefficientsPage() {
  const settings = await getTrialPricingSettings();
  return <CoefficientsForm initial={settings} />;
}
