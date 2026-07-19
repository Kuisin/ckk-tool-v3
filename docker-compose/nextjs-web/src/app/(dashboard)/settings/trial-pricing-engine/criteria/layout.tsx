import { Stack, Title } from "@mantine/core";
import type { ReactNode } from "react";
import { CriteriaListPanel } from "@/components/settings/CriteriaListPanel";
import { MasterDetailShell } from "@/components/ui/MasterDetailShell";
import { getTrialPricingSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

const BASE = "/settings/trial-pricing-engine/criteria";

/** 計算基準: 一覧（左）+ 式編集（右）のスプリットペイン。モバイルは別ページ。 */
export default async function CriteriaLayout({
  children,
}: {
  children: ReactNode;
}) {
  const settings = await getTrialPricingSettings();
  return (
    <MasterDetailShell
      basePath={BASE}
      master={
        <Stack gap="sm">
          <Title order={5}>計算基準</Title>
          <CriteriaListPanel initial={settings.criteria} />
        </Stack>
      }
      masterWidth={400}
    >
      {children}
    </MasterDetailShell>
  );
}
