import { CustomInputsForm } from "@/components/settings/TrialPricingScalarForms";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

export default async function CustomInputsPage() {
  const settings = await getTrialPricingSettings();
  return <CustomInputsForm initial={settings} />;
}
