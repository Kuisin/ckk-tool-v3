"use client";

/**
 * TasksView — 承認・予定 (CM01, /general/tasks)。
 *
 * 個人の「やること」ビュー: 自分の作業予定（work_order_step_plans の未完了分 —
 * 行クリックで工程実行画面へ）と、承認待ちの承認依頼の横断一覧
 * （旧 承認管理 PD03 — approve 権限がある人にだけ出る）。
 */

import { Badge, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconCalendarTime } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import type { ApprovalRequestRow } from "@/app/(dashboard)/general/tasks/approvals-data";
import type { MyPlanRow } from "@/app/(dashboard)/general/tasks/data";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApprovalRequestTable } from "./ApprovalRequestTable";

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
}: {
  plans: MyPlanRow[];
  /** null = approve 権限なし（セクション自体を出さない）。 */
  approvals: ApprovalRequestRow[] | null;
}) {
  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={["一般", "承認・予定"]} title="承認・予定" />

      <Stack gap="xs">
        <Title c="dimmed" order={5}>
          作業予定（自分の担当 {plans.length} 件）
        </Title>
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
      </Stack>

      {approvals != null && (
        <Stack gap="xs">
          <Title c="dimmed" order={5}>
            承認待ち（{approvals.length} 件）
          </Title>
          <ApprovalRequestTable embedded rows={approvals} />
        </Stack>
      )}
    </Stack>
  );
}
