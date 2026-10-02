import { ScalePresetForm } from "@/components/settings/ScalePresetForm";
import { requireAppRead } from "@/lib/authz-page";
import { getScalePreset } from "@/lib/price-scale-preset-store";

export const dynamic = "force-dynamic";

export default async function ScalePresetPage() {
  const denied = await requireAppRead("trial-pricing-engine");
  if (denied) return denied;
  return <ScalePresetForm initial={await getScalePreset()} />;
}
