"use client";

/**
 * ApprovalSettingsView — 承認設定 (MS0B) のタブ。
 *
 *   承認フロー — 書類種別ごとに「何段目にどのグループが」を並べる（既定タブ）。
 *   独自値の追加承認 — 書類に前の書類から引き継いでいない値があるときだけ、
 *                     通常の段の後ろに足す段。通常のフローとは別建て。
 *   承認グループ — 承認者の集合。フローの各段はここから選ぶ。
 *
 * フローを先に出すのは、承認が進まないときに真っ先に見る場所だから。
 */

import { Stack, Tabs } from "@mantine/core";
import { useTranslations } from "next-intl";
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
import {
  CustomValueOverview,
  type CustomValueOverviewRow,
} from "./CustomValueOverview";

export function ApprovalSettingsView({
  flows,
  customValues,
  groups,
}: {
  flows: FlowOverviewRow[];
  customValues: CustomValueOverviewRow[];
  groups: ApprovalGroupRow[];
}) {
  const tr = useTranslations();
  const [tab, setTab] = useTabParam("flows");

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[tr("common.masterData"), tr("common.approvalSettings")]}
        title={tr("common.approvalSettings")}
      />
      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="flows">{tr("common.approvalFlow")}</Tabs.Tab>
          <Tabs.Tab value="custom-values">
            {tr("master.customValueApproval.title")}
          </Tabs.Tab>
          <Tabs.Tab value="groups">{tr("common.approvalGroup")}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel pt="md" value="flows">
          <ApprovalFlowOverview rows={flows} />
        </Tabs.Panel>
        <Tabs.Panel keepMounted={false} pt="md" value="custom-values">
          <CustomValueOverview rows={customValues} />
        </Tabs.Panel>
        <Tabs.Panel keepMounted={false} pt="md" value="groups">
          <ApprovalGroupTable embedded rows={groups} />
        </Tabs.Panel>
      </AppTabs>
    </Stack>
  );
}
