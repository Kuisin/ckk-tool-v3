import { CustomInputsForm } from "@/components/settings/TrialPricingScalarForms";
import { requireAppRead } from "@/lib/authz-page";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

export default async function CustomInputsPage() {
  const denied = await requireAppRead("trial-pricing-engine");
  if (denied) return denied;
  const settings = await getTrialPricingSettings();
  return <CustomInputsForm initial={settings} />;
}
