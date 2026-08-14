"use client";

/**
 * StepCard — 工程ステップカード (_specs/design.md §12.2)。
 * 状態アイコン + 工程名 + 社内/外注バッジ + 実施先 + 外注日程 / 完了情報 /
 * 数量・不良内訳。指示書が承認済み/進行中のときは工程実行画面への
 * 開始/実行ボタンと、完了工程には「分岐追加」メニューを出す。
 */

import {
  ActionIcon,
  Badge,
  Group,
  Menu,
  Paper,
  Text,
  ThemeIcon,
} from "@mantine/core";
import {
  IconArrowsSplit,
  IconCheck,
  IconClock,
  IconDotsVertical,
  IconLoader,
  IconX,
} from "@tabler/icons-react";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { formatDate, formatDateTime } from "@/lib/format";
import type { WorkOrderStepView } from "./work-orders/model";

const STATUS_ICON: Record<string, { color: string; icon: React.ReactNode }> = {
  PENDING: { color: "gray", icon: <IconClock size={14} /> },
  IN_PROGRESS: { color: "blue", icon: <IconLoader size={14} /> },
  COMPLETED: { color: "green", icon: <IconCheck size={14} /> },
  CANCELLED: { color: "red", icon: <IconX size={14} /> },
};

export function StepCard({
  step,
  executeHref,
  onAddBranch,
  selected,
}: {
  step: WorkOrderStepView;
  /** 工程実行画面への deep link（指示書が承認済み/進行中のときのみ）。 */
  executeHref?: string;
  /** 分岐追加（COMPLETED かつ分岐可能数量が残る工程のみ）。 */
  onAddBranch?: () => void;
  /** フロー図側で選択中（強調枠で表示）。 */
  selected?: boolean;
}) {
  const icon = STATUS_ICON[step.status] ?? STATUS_ICON.PENDING;
  const isOutsource = step.executionLocation === "OUTSOURCE";
  const locationName = isOutsource ? step.supplierName : step.plantName;
  const hasQuantities = step.inputQuantity != null;

  // 状態別の実行ボタン（PENDING=開始 / IN_PROGRESS=実行 / COMPLETED=詳細）
  let executeButton: React.ReactNode = null;
  if (executeHref && step.status !== "CANCELLED") {
    if (step.status === "PENDING") {
      executeButton = step.canStart ? (
        <PrimaryButton href={executeHref}>開始</PrimaryButton>
      ) : (
        <SecondaryButton href={executeHref}>開始</SecondaryButton>
      );
    } else if (step.status === "IN_PROGRESS") {
      executeButton = <PrimaryButton href={executeHref}>実行</PrimaryButton>;
    } else {
      executeButton = (
        <SecondaryButton href={executeHref}>詳細</SecondaryButton>
      );
    }
  }

  return (
    <Paper
      p="sm"
      radius="sm"
      style={
        selected
          ? {
              borderColor: "var(--mantine-color-blue-5)",
              boxShadow: "0 0 0 1px var(--mantine-color-blue-5)",
            }
          : undefined
      }
      withBorder
    >
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
        <Group gap="xs" wrap="nowrap">
          {step.plannedWorkHours != null && (
            <Text c="dimmed" className="tabular-nums" size="xs">
              予定 {step.plannedWorkHours}h
            </Text>
          )}
          {locationName && (
            <Text c="dimmed" size="xs" truncate>
              {locationName}
            </Text>
          )}
          {executeButton}
          {onAddBranch && (
            <Menu position="bottom-end" shadow="sm" withinPortal>
              <Menu.Target>
                <ActionIcon
                  aria-label="工程メニュー"
                  color="gray"
                  variant="subtle"
                >
                  <IconDotsVertical size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconArrowsSplit size={14} />}
                  onClick={onAddBranch}
                >
                  分岐追加
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
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

      {(step.planCount > 0 || step.actualCount > 0) && (
        <Group gap="sm" mt="xs" pl={28}>
          <Text c="dimmed" size="xs">
            計画 {step.planCount} 件 / 実績 {step.actualCount} 件
          </Text>
        </Group>
      )}

      {hasQuantities &&
        (step.quantityTracking === "NONE" ? (
          <Group gap="sm" mt="xs" pl={28} wrap="wrap">
            <Text c="dimmed" size="xs">
              通過 {step.inputQuantity}（数量記録なし）
            </Text>
          </Group>
        ) : (
          <Group gap="sm" mt="xs" pl={28} wrap="wrap">
            <Text size="xs">
              {step.quantityTracking === "INSPECTION" ? "検査" : "受入"}{" "}
              {step.inputQuantity}
            </Text>
            {step.outputSuccessQuantity != null && (
              <Text c="green" size="xs">
                {step.quantityTracking === "INSPECTION" ? "合格" : "良品"}{" "}
                {step.outputSuccessQuantity}
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
        ))}
    </Paper>
  );
}
