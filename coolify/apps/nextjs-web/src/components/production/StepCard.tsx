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
import { useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { UserAvatar } from "@/components/ui/UserAvatar";
import type { WorkOrderStepView } from "./work-orders/model";

/** 担当者を顔写真つきで並べる上限（超えた分は「ほか N 名」）。 */
const MAX_SHOWN_ASSIGNEES = 3;

/** 工程状態 → 色 + アイコン。フロー図のノード（WorkflowStepNode）と共有する。 */
export const STEP_STATUS_ICON: Record<
  string,
  { color: string; icon: React.ReactNode }
> = {
  PENDING: { color: "gray", icon: <IconClock size={14} /> },
  IN_PROGRESS: { color: "blue", icon: <IconLoader size={14} /> },
  COMPLETED: { color: "green", icon: <IconCheck size={14} /> },
  CANCELLED: { color: "red", icon: <IconX size={14} /> },
};

export function StepCard({
  step,
  executeHref,
  viewOnly = false,
  onAddBranch,
  selected,
}: {
  step: WorkOrderStepView;
  /** 工程実行画面への deep link。 */
  executeHref?: string;
  /** 指示書が操作不可（完了・キャンセル・未承認）— ラベルを「詳細」にする。 */
  viewOnly?: boolean;
  /** 分岐追加（COMPLETED かつ分岐可能数量が残る工程のみ）。 */
  onAddBranch?: () => void;
  /** フロー図側で選択中（強調枠で表示）。 */
  selected?: boolean;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const icon = STEP_STATUS_ICON[step.status] ?? STEP_STATUS_ICON.PENDING;
  const isOutsource = step.executionLocation === "OUTSOURCE";
  const locationName = isOutsource ? step.supplierName : step.plantName;
  const hasQuantities = step.inputQuantity != null;
  const hasWorkHours =
    step.plannedWorkHours != null || step.actualWorkHours != null;
  const hasLot = step.lotText != null;

  // 状態別の実行ボタン（PENDING=開始 / IN_PROGRESS=実行 / COMPLETED=詳細）。
  // 指示書が操作不可のときは、どの状態でも「詳細」（閲覧）に倒す。
  let executeButton: React.ReactNode = null;
  if (executeHref && viewOnly) {
    executeButton = (
      <SecondaryButton href={executeHref}>
        {tr("production.stepCard.viewDetails")}
      </SecondaryButton>
    );
  } else if (executeHref && step.status !== "CANCELLED") {
    if (step.status === "PENDING") {
      executeButton = step.canStart ? (
        <PrimaryButton href={executeHref}>{tr("common.start")}</PrimaryButton>
      ) : (
        <SecondaryButton href={executeHref}>
          {tr("common.start")}
        </SecondaryButton>
      );
    } else if (step.status === "IN_PROGRESS") {
      executeButton = (
        <PrimaryButton href={executeHref}>{tr("common.run2")}</PrimaryButton>
      );
    } else {
      executeButton = (
        <SecondaryButton href={executeHref}>
          {tr("production.stepCard.viewDetails")}
        </SecondaryButton>
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
            {isOutsource ? tr("common.outsourced") : tr("common.inHouse")}
          </Badge>
          {step.isInspection && (
            <Badge color="blue" size="xs" variant="light">
              {tr("common.inspection")}
            </Badge>
          )}
          {step.isApprovalStep && (
            <Badge color="teal" size="xs" variant="light">
              {tr("common.approve")}
            </Badge>
          )}
        </Group>
        <Group gap="xs" wrap="nowrap">
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
                  aria-label={tr("production.stepCard.stepMenu")}
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
                  {tr("production.stepCard.addABranch")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Group>

      {(step.assignees.length > 0 || hasWorkHours || hasLot) && (
        <Group gap="md" mt="xs" pl={28} wrap="wrap">
          {step.assignees.length > 0 && (
            <Group gap={6} wrap="wrap">
              <Text c="dimmed" size="xs">
                {tr("production.stepCard.assignedTo")}
              </Text>
              {step.assignees.slice(0, MAX_SHOWN_ASSIGNEES).map((a) => (
                <Group gap={4} key={a.userId} wrap="nowrap">
                  <UserAvatar name={a.name} size={18} thumbSrc={a.avatarUrl} />
                  <Text size="xs">{a.name}</Text>
                </Group>
              ))}
              {step.assignees.length > MAX_SHOWN_ASSIGNEES && (
                <Text c="dimmed" size="xs">
                  ほか {step.assignees.length - MAX_SHOWN_ASSIGNEES} 名
                </Text>
              )}
            </Group>
          )}
          {hasWorkHours && (
            <Text c="dimmed" className="tabular-nums" size="xs">
              {step.plannedWorkHours != null &&
                tr("production.stepCard.plannedHoursWithValue", {
                  hours: step.plannedWorkHours,
                })}
              {step.plannedWorkHours != null &&
                step.actualWorkHours != null &&
                " / "}
              {step.actualWorkHours != null &&
                tr("production.stepCard.actualHoursWithValue", {
                  hours: step.actualWorkHours,
                })}
            </Text>
          )}
          {step.lotText != null && (
            <Text c="dimmed" ff="mono" size="xs">
              ロット {step.lotText}
            </Text>
          )}
        </Group>
      )}

      {isOutsource && (
        <Group gap="xl" mt="xs" pl={28}>
          <Text c="dimmed" size="xs">
            依頼: {fmt.date(step.outsourceRequestedAt)}
          </Text>
          <Text c="dimmed" size="xs">
            入荷予定: {fmt.date(step.outsourceExpectedAt)}
          </Text>
        </Group>
      )}

      {step.status === "COMPLETED" && (
        <Group gap="xl" mt="xs" pl={28}>
          <Text c="dimmed" size="xs">
            完了: {fmt.dateTime(step.completedAt)}
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
              {step.quantityTracking === "INSPECTION"
                ? tr("common.inspection")
                : tr("production.stepCard.received")}{" "}
              {step.inputQuantity}
            </Text>
            {step.outputSuccessQuantity != null && (
              <Text c="green" size="xs">
                {step.quantityTracking === "INSPECTION"
                  ? tr("production.stepCard.pass")
                  : tr("production.stepCard.good")}{" "}
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
                工程分岐 {step.outputDefectRework}
              </Badge>
            )}
          </Group>
        ))}
    </Paper>
  );
}
