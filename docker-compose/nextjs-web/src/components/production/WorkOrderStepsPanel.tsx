"use client";

/**
 * WorkOrderStepsPanel — 工程ワークフロー表示パネル (_specs/design.md §12.2)。
 *
 * work_order_steps を sort_order 順の StepCard リストで出す。分岐リンク
 * （work_order_step_links）があれば上部に WorkflowGraph（DAG）を描画する。
 * 指示書が承認済み/進行中のときは各カードに開始/実行の deep link を出し、
 * 完了工程からは AddBranchModal で分岐系列を追加できる。
 */

import { Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import { AddBranchModal } from "./AddBranchModal";
import { StepCard } from "./StepCard";
import { WorkflowGraph } from "./WorkflowGraph";
import type { StepLinkView, WorkOrderStepView } from "./work-orders/model";

const BASE_PATH = "/production/work-orders";

export function WorkOrderStepsPanel({
  steps,
  stepLinks = [],
  workOrderNumber,
  workOrderStatus,
  catalogOptions = [],
}: {
  steps: WorkOrderStepView[];
  stepLinks?: StepLinkView[];
  workOrderNumber?: number;
  workOrderStatus?: string;
  /** 分岐追加モーダル用の工程カタログ options。 */
  catalogOptions?: { value: string; label: string }[];
}) {
  const [branchSource, setBranchSource] = useState<WorkOrderStepView | null>(
    null,
  );
  // 工程実行は承認済み/進行中の指示書のみ（design.md §12.3）
  const isExecutable =
    workOrderNumber != null &&
    (workOrderStatus === "APPROVED" || workOrderStatus === "IN_PROGRESS");

  return (
    <Paper p="md" radius="md" withBorder>
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Title order={5}>工程ワークフロー</Title>
        {!isExecutable && steps.length > 0 && (
          <Text c="dimmed" size="xs">
            工程実行は指示書の承認後に可能になります
          </Text>
        )}
      </Group>

      {stepLinks.length > 0 && (
        <WorkflowGraph links={stepLinks} steps={steps} />
      )}

      {steps.length === 0 ? (
        <Text c="dimmed" size="sm">
          工程がありません
        </Text>
      ) : (
        <Stack gap="xs">
          {steps.map((s) => (
            <StepCard
              executeHref={
                isExecutable
                  ? `${BASE_PATH}/${workOrderNumber}/steps/${s.id}`
                  : undefined
              }
              key={s.id}
              onAddBranch={
                isExecutable &&
                s.status === "COMPLETED" &&
                catalogOptions.length > 0
                  ? () => setBranchSource(s)
                  : undefined
              }
              step={s}
            />
          ))}
        </Stack>
      )}

      {workOrderNumber != null && (
        <AddBranchModal
          catalogOptions={catalogOptions}
          mergeTargets={steps.filter((s) => s.status === "PENDING")}
          onClose={() => setBranchSource(null)}
          opened={branchSource != null}
          sourceStep={branchSource}
          workOrderNumber={workOrderNumber}
        />
      )}
    </Paper>
  );
}
