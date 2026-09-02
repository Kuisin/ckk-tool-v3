import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LookupTablesList } from "@/components/settings/LookupTablesList";
import { MasterDetailShell } from "@/components/ui/MasterDetailShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

const ENGINE = "/settings/trial-pricing-engine";
const BASE = `${ENGINE}/lookups`;

/** ルックアップ表: 上部ヘッダー + 一覧（左）/詳細（右）のリサイズ可能スプリット。 */
export default async function LookupsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const tr = await getTranslations();
  const settings = await getTrialPricingSettings();
  return (
    <MasterDetailShell
      basePath={BASE}
      header={
        <PageHeader
          breadcrumbs={[
            tr("common.system"),
            { label: tr("common.priceEstimateEngine"), href: ENGINE },
            tr("common.lookupTable"),
          ]}
          title={tr("common.lookupTable")}
        />
      }
      master={<LookupTablesList tables={settings.lookupTables} />}
    >
      {children}
    </MasterDetailShell>
  );
}
