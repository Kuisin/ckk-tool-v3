/**
 * StepCard — 工程ステップカード (_specs/design.md §12.2)。表示専用（PR 3 で
 * 実行系を追加）。状態アイコン + 工程名 + 社内/外注バッジ + 実施先 +
 * 外注日程 / 完了情報 / 数量・不良内訳。
 */

import { Badge, Group, Paper, Text, ThemeIcon } from "@mantine/core";
import { IconCheck, IconClock, IconLoader, IconX } from "@tabler/icons-react";
import { formatDate, formatDateTime } from "@/lib/format";
import type { WorkOrderStepView } from "./work-orders/model";

const STATUS_ICON: Record<string, { color: string; icon: React.ReactNode }> = {
  PENDING: { color: "gray", icon: <IconClock size={14} /> },
  IN_PROGRESS: { color: "blue", icon: <IconLoader size={14} /> },
  COMPLETED: { color: "green", icon: <IconCheck size={14} /> },
  CANCELLED: { color: "red", icon: <IconX size={14} /> },
};

export function StepCard({ step }: { step: WorkOrderStepView }) {
  const icon = STATUS_ICON[step.status] ?? STATUS_ICON.PENDING;
  const isOutsource = step.executionLocation === "OUTSOURCE";
  const locationName = isOutsource ? step.supplierName : step.factoryName;
  const hasQuantities = step.inputQuantity != null;

  return (
    <Paper p="sm" radius="sm" withBorder>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon color={icon.color} radius="xl" size="sm" variant="light">
            {icon.icon}
          </ThemeIcon>
          <Text fw={600} size="sm">
            {step.name}
          </Text>
          <Badge
            color={isOutsource ? "orange" : "gray"}
            size="xs"
            variant="outline"
          >
            {isOutsource ? "外注" : "社内"}
          </Badge>
          {step.isInspection && (
            <Badge color="blue" size="xs" variant="light">
              検査
            </Badge>
          )}
          {step.isApprovalStep && (
            <Badge color="teal" size="xs" variant="light">
              承認
            </Badge>
          )}
        </Group>
        {locationName && (
          <Text c="dimmed" size="xs" truncate>
            {locationName}
          </Text>
        )}
      </Group>

      {isOutsource && (
        <Group gap="xl" mt="xs" pl={28}>
          <Text c="dimmed" size="xs">
            依頼: {formatDate(step.outsourceRequestedAt)}
          </Text>
          <Text c="dimmed" size="xs">
            入荷予定: {formatDate(step.outsourceExpectedAt)}
          </Text>
        </Group>
      )}

      {step.status === "COMPLETED" && (
        <Group gap="xl" mt="xs" pl={28}>
          <Text c="dimmed" size="xs">
            完了: {formatDateTime(step.completedAt)}
            {step.completedByName ? `（${step.completedByName}）` : ""}
          </Text>
        </Group>
      )}

      {hasQuantities && (
        <Group gap="sm" mt="xs" pl={28} wrap="wrap">
          <Text size="xs">受入 {step.inputQuantity}</Text>
          {step.outputSuccessQuantity != null && (
            <Text c="green" size="xs">
              良品 {step.outputSuccessQuantity}
            </Text>
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
              手直し {step.outputDefectRework}
            </Badge>
          )}
        </Group>
      )}
    </Paper>
  );
}
