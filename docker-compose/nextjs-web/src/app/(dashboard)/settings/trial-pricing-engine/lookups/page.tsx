import { LookupTablesForm } from "@/components/settings/LookupTablesForm";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

export default async function LookupsPage() {
  const settings = await getTrialPricingSettings();
  return <LookupTablesForm initial={settings.lookupTables} />;
}
