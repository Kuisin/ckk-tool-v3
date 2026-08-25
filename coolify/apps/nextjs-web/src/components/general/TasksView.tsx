"use client";

/**
 * TasksView — 承認・予定 (CM01, /general/tasks)。
 *
 * 個人の「やること」ビュー。タブ 2 枚: 作業予定（work_order_step_plans の
 * 未完了分 — 行クリックで工程実行画面へ）/ 承認待ち（承認依頼の横断一覧 —
 * 旧 承認管理 PD03。approve 権限がある人にだけタブが出る）。
 * アクティブタブは ?tab= に保持（URL 共有でタブまで再現）。
 */

import { Badge, Group, Paper, Stack, Tabs, Text } from "@mantine/core";
import { IconCalendarTime } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import type { ApprovalRequestRow } from "@/app/(dashboard)/general/tasks/approvals-data";
import type { MyPlanRow } from "@/app/(dashboard)/general/tasks/data";
import type { FormTasks } from "@/app/(dashboard)/general/tasks/forms-data";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTabParam } from "@/hooks/useUrlState";
import { ApprovalRequestTable } from "./ApprovalRequestTable";
import { MyResponsesList, PendingFormsList } from "./FormTasksPanel";

const WORK_ORDERS_PATH = "/production/work-orders";

function PlanRow({ plan }: { plan: MyPlanRow }) {
  const fmt = useFormat();
  const router = useRouter();
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
            <Group gap="xs" wrap="nowrap">
              <Text fw={600} size="sm" truncate>
                {plan.stepName}
              </Text>
              <StatusBadge entity="Step" status={plan.stepStatus} />
            </Group>
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
          </Stack>
        </Group>
        <Group gap="xs" style={{ flexShrink: 0 }}>
          {plan.quantity != null && (
            <Badge color="gray" variant="light">
              {plan.quantity} 本
            </Badge>
          )}
        </Group>
      </Group>
    </Paper>
  );
}

export function TasksView({
  plans,
  approvals,
  forms,
}: {
  plans: MyPlanRow[];
  /** null = approve 権限なし（セクション自体を出さない）。 */
  approvals: ApprovalRequestRow[] | null;
  forms: FormTasks;
}) {
  const [tab, setTab] = useTabParam("plans");
  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={["一般", "承認・予定"]} title="承認・予定" />

      <Tabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab
            rightSection={
              plans.length > 0 && (
                <Badge color="indigo" size="sm" variant="light">
                  {plans.length}
                </Badge>
              )
            }
            value="plans"
          >
            作業予定
          </Tabs.Tab>
          {approvals != null && (
            <Tabs.Tab
              rightSection={
                approvals.length > 0 && (
                  <Badge color="yellow" size="sm" variant="light">
                    {approvals.length}
                  </Badge>
                )
              }
              value="approvals"
            >
              承認待ち
            </Tabs.Tab>
          )}
          <Tabs.Tab
            rightSection={
              forms.pending.length > 0 && (
                <Badge color="cyan" size="sm" variant="light">
                  {forms.pending.length}
                </Badge>
              )
            }
            value="forms"
          >
            未回答のフォーム
          </Tabs.Tab>
          <Tabs.Tab value="my-forms">回答済みのフォーム</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="plans">
          {plans.length === 0 ? (
            <Paper p="md" radius="md" withBorder>
              <EmptyState
                icon={<IconCalendarTime size={24} />}
                message="割り当てられた作業予定はありません"
              />
            </Paper>
          ) : (
            <Stack gap="xs">
              {plans.map((p) => (
                <PlanRow key={p.id} plan={p} />
              ))}
            </Stack>
          )}
        </Tabs.Panel>

        {approvals != null && (
          <Tabs.Panel pt="md" value="approvals">
            <ApprovalRequestTable embedded rows={approvals} />
          </Tabs.Panel>
        )}

        <Tabs.Panel pt="md" value="forms">
          <PendingFormsList rows={forms.pending} />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="my-forms">
          <MyResponsesList rows={forms.mine} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
