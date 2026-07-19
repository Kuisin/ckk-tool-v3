import type { ReactNode } from "react";
import { LookupTablesList } from "@/components/settings/LookupTablesList";
import { MasterDetailShell } from "@/components/ui/MasterDetailShell";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

const BASE = "/settings/trial-pricing-engine/lookups";

/** ルックアップ表: 一覧（左）+ 詳細（右）のスプリットペイン。モバイルは別ページ。 */
export default async function LookupsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const settings = await getTrialPricingSettings();
  return (
    <MasterDetailShell
      basePath={BASE}
      master={<LookupTablesList tables={settings.lookupTables} />}
      masterWidth={320}
    >
      {children}
    </MasterDetailShell>
  );
}
