import type { ReactNode } from "react";
import { ToolTypesPanel } from "@/components/settings/ToolTypesPanel";
import { MasterDetailShell } from "@/components/ui/MasterDetailShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

const ENGINE = "/settings/trial-pricing-engine";
const BASE = `${ENGINE}/tool-types`;

/** 工具種管理: 上部ヘッダー + 一覧（左）/適用基準編集（右）のスプリット。 */
export default async function ToolTypesLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [settings, counts] = await Promise.all([
    getTrialPricingSettings(),
    prisma.estimate.groupBy({ by: ["toolType"], _count: { _all: true } }),
  ]);
  const usage = Object.fromEntries(
    counts.map((c) => [c.toolType, c._count._all]),
  );

  return (
    <MasterDetailShell
      basePath={BASE}
      header={
        <PageHeader
          breadcrumbs={[
            "システム",
            { label: "価格試算計算", href: ENGINE },
            "工具種管理",
          ]}
          title="工具種管理"
        />
      }
      initialMasterWidth={340}
      master={
        <ToolTypesPanel
          criteria={settings.criteria}
          toolTypes={settings.toolTypes}
          usage={usage}
        />
      }
    >
      {children}
    </MasterDetailShell>
  );
}
