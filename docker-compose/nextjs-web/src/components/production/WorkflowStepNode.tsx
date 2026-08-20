"use client";

/**
 * WorkflowStepNode — フロー図（React Flow）の工程ノード。
 *
 * ノードの中身はただの Mantine コンポーネント（HTML）なので、工程名を
 * 省略せずに出せる — 旧・手書き SVG では日本語の文字幅を測れず 10 文字で
 * 切っていた。状態アイコン・外注バッジ・数量バッジの語彙は StepCard と
 * 共通（STEP_STATUS_ICON を共有）。
 *
 * 位置は lib/workflow-core.ts の layoutWorkflowGraph が決める。React Flow に
 * レイアウトはさせない（描画層として差し替え可能に保つため）。
 */

import { Badge, Group, Paper, Text, ThemeIcon } from "@mantine/core";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { STEP_STATUS_ICON } from "./StepCard";
import type { WorkOrderStepView } from "./work-orders/model";

/** ノード幅（レイアウトの X ピッチと対で決める）。 */
export const STEP_NODE_WIDTH = 200;

export interface StepNodeData extends Record<string, unknown> {
  step: WorkOrderStepView;
  /** リスト側と同期した選択状態（React Flow 自身の selected とは別物）。 */
  highlighted: boolean;
}

export type StepFlowNode = Node<StepNodeData, "workflowStep">;

/** 閲覧専用なので接続ハンドルは見せない（接続 UI は編集フェーズで出す）。 */
const HANDLE_STYLE = { opacity: 0, pointerEvents: "none" } as const;

export function WorkflowStepNode({ data }: NodeProps<StepFlowNode>) {
  const { step, highlighted } = data;
  const icon = STEP_STATUS_ICON[step.status] ?? STEP_STATUS_ICON.PENDING;
  const isOutsource = step.executionLocation === "OUTSOURCE";
  const hasQuantities = step.inputQuantity != null;

  return (
    <>
      <Handle
        isConnectable={false}
        position={Position.Top}
        style={HANDLE_STYLE}
        type="target"
      />
      <Paper
        p="xs"
        radius="sm"
        style={{
          backgroundColor: "var(--mantine-color-body)",
          borderColor: highlighted ? "var(--mantine-color-blue-5)" : undefined,
          boxShadow: highlighted
            ? "0 0 0 1px var(--mantine-color-blue-5)"
            : undefined,
          width: STEP_NODE_WIDTH,
        }}
        withBorder
      >
        <Group gap={6} wrap="nowrap">
          <ThemeIcon color={icon.color} radius="xl" size="sm" variant="light">
            {icon.icon}
          </ThemeIcon>
          <Text
            fw={600}
            lh={1.2}
            lineClamp={2}
            size="xs"
            style={{ flex: 1, minWidth: 0 }}
          >
            {step.name}
          </Text>
        </Group>
        <Group gap={4} mt={6} wrap="wrap">
          {isOutsource && (
            <Badge color="orange" size="xs" variant="outline">
              外注
            </Badge>
          )}
          {hasQuantities ? (
            <>
              <Badge color="gray" size="xs" variant="light">
                受入 {step.inputQuantity}
              </Badge>
              {step.outputSuccessQuantity != null && (
                <Badge color="green" size="xs" variant="light">
                  良品 {step.outputSuccessQuantity}
                </Badge>
              )}
              {(step.outputDefectSemiFinished ?? 0) > 0 && (
                <Badge color="orange" size="xs" variant="light">
                  半製品 {step.outputDefectSemiFinished}
                </Badge>
              )}
              {(step.outputDefectScrap ?? 0) > 0 && (
                <Badge color="red" size="xs" variant="light">
                  廃棄 {step.outputDefectScrap}
                </Badge>
              )}
              {(step.outputDefectRework ?? 0) > 0 && (
                <Badge color="yellow" size="xs" variant="light">
                  工程分岐 {step.outputDefectRework}
                </Badge>
              )}
            </>
          ) : (
            <Text c="dimmed" size="xs">
              {step.status === "CANCELLED" ? "キャンセル" : "未着手"}
            </Text>
          )}
        </Group>
      </Paper>
      <Handle
        isConnectable={false}
        position={Position.Bottom}
        style={HANDLE_STYLE}
        type="source"
      />
    </>
  );
}
