"use client";

/**
 * ApprovalSettingsView — 承認設定 (MS0B) のタブ。
 *
 *   承認フロー — 書類種別ごとに「何段目にどのグループが」を並べる（既定タブ）。
 *   承認グループ — 承認者の集合。フローの各段はここから選ぶ。
 *
 * フローを先に出すのは、承認が進まないときに真っ先に見る場所だから。
 */

import { Stack, Tabs } from "@mantine/core";
import {
  type ApprovalGroupRow,
  ApprovalGroupTable,
} from "@/components/master/approval-settings/ApprovalGroupTable";
import { AppTabs } from "@/components/ui/AppTabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTabParam } from "@/hooks/useUrlState";
import {
  ApprovalFlowOverview,
  type FlowOverviewRow,
} from "./ApprovalFlowOverview";

export function ApprovalSettingsView({
  flows,
  groups,
}: {
  flows: FlowOverviewRow[];
  groups: ApprovalGroupRow[];
}) {
  const [tab, setTab] = useTabParam("flows");

  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={["マスタ", "承認設定"]} title="承認設定" />
      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="flows">承認フロー</Tabs.Tab>
          <Tabs.Tab value="groups">承認グループ</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel pt="md" value="flows">
          <ApprovalFlowOverview rows={flows} />
        </Tabs.Panel>
        <Tabs.Panel keepMounted={false} pt="md" value="groups">
          <ApprovalGroupTable embedded rows={groups} />
        </Tabs.Panel>
      </AppTabs>
    </Stack>
  );
}
