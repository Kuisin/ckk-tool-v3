"use client";

/**
 * WorkflowStepNode — フロー図（React Flow）の工程ノード。
 *
 * ノードの中身はただの Mantine コンポーネント（HTML）なので、工程名を
 * 省略せずに出せる — 旧・手書き SVG では日本語の文字幅を測れず 10 文字で
 * 切っていた。数量バッジの語彙は StepCard と共通。
 *
 * **色は工程種別（PROCESS_CATEGORY）**で決まる（左の 4px アクセント + 種別
 * バッジ + アイコン地色 — PROCESS_CATEGORY_COLOR）。状態は色ではなくアイコン
 * （時計 / スピナー / チェック / ✗）と、進行を止めている状態のバッジで示す:
 *
 *   - PENDING かつ開始可能  → 緑「開始可」（= いま着手できる工程）
 *   - PENDING で依存未達    → 灰「未着手」
 *   - CANCELLED             → 赤「キャンセル」
 *
 * 位置は lib/workflow-core.ts の layoutWorkflowGraph が決める。React Flow に
 * レイアウトはさせない（描画層として差し替え可能に保つため）。
 */

import { Badge, Group, Paper, Text, ThemeIcon } from "@mantine/core";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { useLocale, useTranslations } from "next-intl";
import {
  PROCESS_CATEGORY_COLOR,
  processCategoryLabel,
} from "@/lib/enum-labels";
import { STEP_STATUS_ICON } from "./StepCard";
import type { WorkOrderStepView } from "./work-orders/model";

/** ノード幅（レイアウトの X ピッチと対で決める）。 */
export const STEP_NODE_WIDTH = 208;

const FALLBACK_CATEGORY_COLOR = "gray";

export interface StepNodeData extends Record<string, unknown> {
  step: WorkOrderStepView;
  /** リスト側と同期した選択状態（React Flow 自身の selected とは別物）。 */
  highlighted: boolean;
}

export type StepFlowNode = Node<StepNodeData, "workflowStep">;

/** 閲覧専用なので接続ハンドルは見せない（接続 UI は編集フェーズで出す）。 */
const HANDLE_STYLE = { opacity: 0, pointerEvents: "none" } as const;

export function WorkflowStepNode({ data }: NodeProps<StepFlowNode>) {
  const tr = useTranslations();
  const locale = useLocale();
  const { step, highlighted } = data;
  const icon = STEP_STATUS_ICON[step.status] ?? STEP_STATUS_ICON.PENDING;
  const isOutsource = step.executionLocation === "OUTSOURCE";
  const hasQuantities = step.inputQuantity != null;
  const categoryColor =
    PROCESS_CATEGORY_COLOR[step.category] ?? FALLBACK_CATEGORY_COLOR;
  const categoryLabel =
    processCategoryLabel(step.category, locale) ?? step.category;
  // 実行可否 — canStart はサーバーが canStartStep で算出済み（依存工程の完了）。
  const startable = step.status === "PENDING" && step.canStart;

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
          // 左 4px = 工程種別の色。選択中は枠を青で上書きする。
          borderColor: highlighted ? "var(--mantine-color-blue-5)" : undefined,
          borderLeft: `4px solid var(--mantine-color-${categoryColor}-6)`,
          boxShadow: highlighted
            ? "0 0 0 1px var(--mantine-color-blue-5)"
            : undefined,
          width: STEP_NODE_WIDTH,
        }}
        withBorder
      >
        <Group gap={6} wrap="nowrap">
          <ThemeIcon
            color={categoryColor}
            radius="xl"
            size="sm"
            variant="light"
          >
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
          <Badge color={categoryColor} size="xs" variant="light">
            {categoryLabel}
          </Badge>
          {startable && (
            <Badge color="green" size="xs" variant="filled">
              {tr("production.workflowStepNode.ready")}
            </Badge>
          )}
          {isOutsource && (
            <Badge color="orange" size="xs" variant="outline">
              {tr("common.outsourced")}
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
          ) : step.status === "CANCELLED" ? (
            <Badge color="red" size="xs" variant="light">
              {tr("common.cancel")}
            </Badge>
          ) : (
            // 開始可のときは「開始可」バッジが出ているので重ねて言わない。
            !startable && (
              <Text c="dimmed" size="xs">
                {tr("production.workflowStepNode.notStarted")}
              </Text>
            )
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
