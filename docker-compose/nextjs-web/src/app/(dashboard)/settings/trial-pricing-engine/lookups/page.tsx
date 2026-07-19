import { LookupTablesList } from "@/components/settings/LookupTablesList";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

/** ルックアップ表 一覧（閲覧モード）。各行は詳細（編集）ページを別ウィンドウで開く。 */
export default async function LookupsPage() {
  const settings = await getTrialPricingSettings();
  return <LookupTablesList tables={settings.lookupTables} />;
}
