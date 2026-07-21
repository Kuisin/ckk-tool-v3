import { IconPlus } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { LookupTablesList } from "@/components/settings/LookupTablesList";
import { PrimaryButton } from "@/components/ui/buttons";
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
  const settings = await getTrialPricingSettings();
  return (
    <MasterDetailShell
      basePath={BASE}
      header={
        <PageHeader
          actions={
            <PrimaryButton
              href={`${BASE}/new`}
              leftSection={<IconPlus size={16} />}
            >
              新規
            </PrimaryButton>
          }
          breadcrumbs={[
            "システム",
            { label: "試算計算", href: ENGINE },
            "ルックアップ表",
          ]}
          title="ルックアップ表"
        />
      }
      master={<LookupTablesList tables={settings.lookupTables} />}
    >
      {children}
    </MasterDetailShell>
  );
}
