/**
 * WorkOrderStepsPanel — 工程ワークフロー表示パネル (_specs/design.md §12.2)。
 *
 * この PR は表示専用: work_order_steps を sort_order 順の StepCard リストで
 * 出す。工程実行・DAG（分岐合流）グラフ・変更承認依頼は PR 3。
 */

import { Group, Paper, Stack, Text, Title } from "@mantine/core";
import { StepCard } from "./StepCard";
import type { WorkOrderStepView } from "./work-orders/model";

export function WorkOrderStepsPanel({ steps }: { steps: WorkOrderStepView[] }) {
  return (
    <Paper p="md" radius="md" withBorder>
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Title order={5}>工程ワークフロー</Title>
        <Text c="dimmed" size="xs">
          工程実行は各工程画面から（準備中）
        </Text>
      </Group>
      {steps.length === 0 ? (
        <Text c="dimmed" size="sm">
          工程がありません
        </Text>
      ) : (
        <Stack gap="xs">
          {steps.map((s) => (
            <StepCard key={s.id} step={s} />
          ))}
        </Stack>
      )}
    </Paper>
  );
}
