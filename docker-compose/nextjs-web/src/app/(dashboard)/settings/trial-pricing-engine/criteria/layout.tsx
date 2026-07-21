import type { ReactNode } from "react";
import { CriteriaListPanel } from "@/components/settings/CriteriaListPanel";
import { MasterDetailShell } from "@/components/ui/MasterDetailShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

const ENGINE = "/settings/trial-pricing-engine";
const BASE = `${ENGINE}/criteria`;

/** 計算基準: 上部ヘッダー + 一覧（左）/式編集（右）のリサイズ可能スプリット。 */
export default async function CriteriaLayout({
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
          breadcrumbs={[
            "システム",
            { label: "試算計算", href: ENGINE },
            "計算基準",
          ]}
          title="計算基準"
        />
      }
      initialMasterWidth={380}
      master={<CriteriaListPanel initial={settings.criteria} />}
    >
      {children}
    </MasterDetailShell>
  );
}
