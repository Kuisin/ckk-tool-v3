"use client";

/**
 * TasksView — 承認・予定 (CM01, /general/tasks)。
 *
 * 個人の「やること」ビュー。タブは 6 枚（作業予定 / 承認依頼中 / 未回答のフォーム /
 * 回答済みのフォーム / 完了した申請 / 文書のコメント）で、出るかどうかは
 *   ① その人に出せるか（承認権限・完了通知の有無）
 *   ② 本人が隠していないか（app.user_view_settings — 右上「表示するタブ」）
 * の 2 段で決まる。判定は lib/tasks-tabs.ts（純関数）に置いてある。
 *
 * アクティブタブは ?tab= に保持（URL 共有でタブまで再現）。隠したタブの URL を
 * 踏んだときは先頭のタブへ落とす（空白の画面を出さない）。
 */

import { Badge, Group, Paper, Stack, Tabs, Text } from "@mantine/core";
import { IconCalendarTime } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { ApprovalRequestRow } from "@/app/(dashboard)/general/tasks/approvals-data";
import type { InboxCommentRow } from "@/app/(dashboard)/general/tasks/comments-data";
import type { CompletedRequestRow } from "@/app/(dashboard)/general/tasks/completions-data";
import type { MyPlanRow } from "@/app/(dashboard)/general/tasks/data";
import type { FormTasks } from "@/app/(dashboard)/general/tasks/forms-data";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { AppTabs } from "@/components/ui/AppTabs";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTr } from "@/hooks/useTr";
import { useTabParam } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { resolveActiveTab, visibleTaskTabs } from "@/lib/tasks-tabs";
import { ApprovalRequestTable } from "./ApprovalRequestTable";
import {
  CompletedRequestsList,
  MyResponsesList,
  PendingFormsList,
} from "./FormTasksPanel";
import { InboxCommentsList } from "./InboxCommentsList";
import { TaskTabsSettingsButton } from "./TaskTabsSettings";

const WORK_ORDERS_PATH = "/production/work-orders";

/**
 * 作業予定の 1 行。
 *
 * スマホでは横並びをやめて縦に積む — 日付・工程名・書類番号・製品名・数量を
 * 1 行に押し込むと、幅 375px では工程名が数文字で切れて何の作業か読めない。
 */
function PlanRow({ plan }: { plan: MyPlanRow }) {
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();

  const when = (
    <Group gap={6} wrap="nowrap">
      <Text className="tabular-nums" fw={600} size="sm">
        {fmt.date(plan.date)}
      </Text>
      {plan.startTime && (
        <Text c="dimmed" className="tabular-nums" size="xs">
          {plan.startTime}
          {plan.endTime ? `〜${plan.endTime}` : ""}
        </Text>
      )}
    </Group>
  );

  const quantity = plan.quantity != null && (
    <Badge color="gray" variant="light">
      {plan.quantity} 本
    </Badge>
  );

  const meta = (
    <Group gap="xs" wrap="wrap">
      <DocNumber c="dimmed">{plan.docNumber}</DocNumber>
      <Text c="dimmed" size="xs" truncate>
        {plan.productName}
      </Text>
      {plan.workLocationName && (
        <Text c="dimmed" size="xs">
          {plan.workLocationName}
        </Text>
      )}
    </Group>
  );

  const title = (
    <Group gap="xs" wrap="nowrap">
      <Text fw={600} size="sm" truncate>
        {plan.stepName}
      </Text>
      <StatusBadge entity="Step" status={plan.stepStatus} />
    </Group>
  );

  return (
    <Paper
      onClick={() =>
        router.push(
          `${WORK_ORDERS_PATH}/${plan.workOrderNumber}/steps/${plan.stepId}`,
        )
      }
      p="sm"
      radius="sm"
      style={{ cursor: "pointer" }}
      withBorder
    >
      {isMobile ? (
        <Stack gap={4}>
          <Group justify="space-between" wrap="nowrap">
            {when}
            {quantity}
          </Group>
          {title}
          {meta}
        </Stack>
      ) : (
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" style={{ minWidth: 0 }} wrap="nowrap">
            <Stack gap={2} style={{ minWidth: 90 }}>
              <Text className="tabular-nums" fw={600} size="sm">
                {fmt.date(plan.date)}
              </Text>
              {plan.startTime && (
                <Text c="dimmed" className="tabular-nums" size="xs">
                  {plan.startTime}
                  {plan.endTime ? `〜${plan.endTime}` : ""}
                </Text>
              )}
            </Stack>
            <Stack gap={2} style={{ minWidth: 0 }}>
              {title}
              {meta}
            </Stack>
          </Group>
          <Group gap="xs" style={{ flexShrink: 0 }}>
            {quantity}
          </Group>
        </Group>
      )}
    </Paper>
  );
}

export function TasksView({
  plans,
  approvals,
  forms,
  comments,
  completions,
  hiddenTabs,
}: {
  plans: MyPlanRow[];
  /** null = approve 権限なし（セクション自体を出さない）。 */
  approvals: ApprovalRequestRow[] | null;
  forms: FormTasks;
  comments: InboxCommentRow[];
  /** 自分宛に届いた「完了した申請・報告」。1 件も無ければタブを出さない。 */
  completions: CompletedRequestRow[];
  /** 本人が隠しているタブ（app.user_view_settings）。 */
  hiddenTabs: string[];
}) {
  const tr = useTr();
  const unreadCompletions = completions.filter((c) => !c.readAt).length;

  // 出せるタブ = 権限と件数で決まるもの。隠す設定はこの上に効く。
  const available = [
    "plans",
    ...(approvals != null ? ["approvals"] : []),
    "forms",
    "my-forms",
    ...(completions.length > 0 ? ["completions"] : []),
    "comments",
  ];
  const visible = visibleTaskTabs(available, hiddenTabs);
  const [requestedTab, setTab] = useTabParam(visible[0]?.id ?? "plans");
  const tab = resolveActiveTab(requestedTab, visible);

  /** タブ名の右に出す件数バッジ（0 なら出さない）。 */
  const badges: Record<string, { count: number; color: string }> = {
    plans: { count: plans.length, color: "indigo" },
    approvals: { count: approvals?.length ?? 0, color: "yellow" },
    forms: { count: forms.pending.length, color: "cyan" },
    "my-forms": { count: 0, color: "gray" },
    completions: { count: unreadCompletions, color: "blue" },
    comments: { count: comments.length, color: "blue" },
  };

  const panels: Record<string, ReactNode> = {
    plans:
      plans.length === 0 ? (
        <Paper p="md" radius="md" withBorder>
          <EmptyState
            icon={<IconCalendarTime size={24} />}
            message={tr("割り当てられた作業予定はありません")}
          />
        </Paper>
      ) : (
        <Stack gap="xs">
          {plans.map((p) => (
            <PlanRow key={p.id} plan={p} />
          ))}
        </Stack>
      ),
    approvals: approvals != null && (
      <ApprovalRequestTable embedded rows={approvals} />
    ),
    forms: <PendingFormsList rows={forms.pending} />,
    "my-forms": <MyResponsesList rows={forms.mine} />,
    completions: <CompletedRequestsList rows={completions} />,
    comments: <InboxCommentsList rows={comments} />,
  };

  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <TaskTabsSettingsButton available={available} hidden={hiddenTabs} />
        }
        breadcrumbs={[tr("一般"), tr("承認・予定")]}
        title={tr("承認・予定")}
      />

      <AppTabs onChange={setTab} value={tab}>
        {/* 横幅に収まらないときは AppTabs がドロップダウンへ切り替える。 */}
        <Tabs.List>
          {visible.map((t) => {
            const badge = badges[t.id];
            return (
              <Tabs.Tab
                key={t.id}
                rightSection={
                  badge && badge.count > 0 ? (
                    <Badge color={badge.color} size="sm" variant="light">
                      {badge.count}
                    </Badge>
                  ) : undefined
                }
                value={t.id}
              >
                {t.label}
              </Tabs.Tab>
            );
          })}
        </Tabs.List>

        {visible.map((t) => (
          <Tabs.Panel key={t.id} pt="md" value={t.id}>
            {panels[t.id]}
          </Tabs.Panel>
        ))}
      </AppTabs>
    </Stack>
  );
}
