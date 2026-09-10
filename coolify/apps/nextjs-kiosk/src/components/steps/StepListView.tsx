"use client";

/**
 * StepListView.tsx — 自分の担当工程の一覧（遅延 / 本日 / 予定）。
 *
 * 割り当ての実体は work_order_step_plans（担当者）。カードは大きめの
 * タッチターゲット（テーマ既定 size="lg"）で、行き先は /steps/[stepId]。
 */

import {
  Badge,
  Box,
  Button,
  Center,
  Checkbox,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconChecks,
  IconChevronDown,
  IconChevronUp,
  IconClipboardList,
  IconRefresh,
  IconSquareCheck,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fillMessage } from "@/lib/i18n";
import { batchActionsFor } from "@/lib/step-batch-core";
import type { MyStepView } from "@/lib/steps";
import type { StepBucket } from "@/lib/steps-core";
import { ActivityMonitor } from "../ActivityMonitor";
import { useI18n } from "../I18nProvider";
import { LiveElapsed } from "./LiveElapsed";
import { StepBatchBar } from "./StepBatchBar";
import { stateColor, stateLabel } from "./step-ui";

type Props = {
  steps: MyStepView[];
  upcomingCount: number;
  completedSteps: MyStepView[];
};

const SECTION_ORDER: StepBucket[] = ["OVERDUE", "TODAY", "UPCOMING"];

export function StepListView({ steps, upcomingCount, completedSteps }: Props) {
  const router = useRouter();
  const { m } = useI18n();
  const [refreshing, setRefreshing] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  // 選択モードは**任意で入る**。常時チェックボックスを出すとカードのタップ的を
  // 食う（カードを押して 1 件開くのが今も主な操作）。
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedSet = new Set(selectedIds);
  const selectedSteps = steps.filter((s) => selectedSet.has(s.stepId));

  const toggle = (stepId: string) =>
    setSelectedIds((ids) =>
      ids.includes(stepId) ? ids.filter((i) => i !== stepId) : [...ids, stepId],
    );

  const leaveSelecting = () => {
    setSelecting(false);
    setSelectedIds([]);
  };

  const refresh = () => {
    setRefreshing(true);
    router.refresh();
    // router.refresh() は完了を待てないので、視覚的な二度押し防止だけ行う
    setTimeout(() => setRefreshing(false), 600);
  };

  const byBucket = (bucket: StepBucket) =>
    steps.filter((s) => s.bucket === bucket);

  return (
    <Box p="lg" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <ActivityMonitor />

      <Stack gap="lg" maw={960} mx="auto" style={{ flex: 1, width: "100%" }}>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Button
              leftSection={<IconArrowLeft size={20} />}
              onClick={() => router.push("/")}
              variant="default"
            >
              {m.steps.back}
            </Button>
            <Title order={3}>{m.steps.title}</Title>
          </Group>
          <Group gap="sm" wrap="nowrap">
            {upcomingCount > 0 && (
              <Badge color="gray" size="lg" variant="light">
                {fillMessage(m.steps.upcoming, { n: upcomingCount })}
              </Badge>
            )}
            {steps.length > 1 && (
              <Button
                leftSection={<IconSquareCheck size={20} />}
                onClick={() =>
                  selecting ? leaveSelecting() : setSelecting(true)
                }
                variant={selecting ? "filled" : "default"}
              >
                {selecting ? m.steps.batch.cancelSelect : m.steps.batch.select}
              </Button>
            )}
            <Button
              leftSection={<IconRefresh size={20} />}
              loading={refreshing}
              onClick={refresh}
              variant="default"
            >
              {m.steps.refresh}
            </Button>
          </Group>
        </Group>

        {steps.length === 0 ? (
          <Center style={{ flex: 1 }}>
            <Stack align="center" gap="sm">
              <ThemeIcon color="blue" radius="md" size={64} variant="light">
                <IconClipboardList size={36} />
              </ThemeIcon>
              <Text c="dimmed">{m.steps.empty}</Text>
            </Stack>
          </Center>
        ) : (
          SECTION_ORDER.map((bucket) => {
            const rows = byBucket(bucket);
            if (rows.length === 0) return null;
            return (
              <Stack gap="sm" key={bucket}>
                <Text c="dimmed" fw={600} size="sm">
                  {bucket === "OVERDUE"
                    ? m.steps.sections.overdue
                    : bucket === "TODAY"
                      ? m.steps.sections.today
                      : m.steps.sections.upcoming}
                </Text>
                {rows.map((step) => (
                  <StepCard
                    key={step.stepId}
                    onToggle={toggle}
                    selected={selectedSet.has(step.stepId)}
                    selecting={selecting}
                    step={step}
                  />
                ))}
              </Stack>
            );
          })
        )}

        {/* 完了した工程 — 既定は非表示。ボタンで開閉する */}
        {completedSteps.length > 0 && (
          <Stack gap="sm">
            <Button
              fullWidth
              leftSection={<IconChecks size={20} />}
              onClick={() => setShowCompleted((s) => !s)}
              rightSection={
                showCompleted ? (
                  <IconChevronUp size={18} />
                ) : (
                  <IconChevronDown size={18} />
                )
              }
              variant="subtle"
            >
              {showCompleted
                ? m.steps.hideCompleted
                : fillMessage(m.steps.showCompleted, {
                    n: completedSteps.length,
                  })}
            </Button>
            {showCompleted &&
              completedSteps.map((step) => (
                <StepCard key={step.stepId} step={step} />
              ))}
          </Stack>
        )}

        {selecting && (
          <StepBatchBar
            onFinished={(failedIds) => {
              // 失敗した工程は選択に残す — 直してすぐ再試行できるように
              setSelectedIds(failedIds);
              if (failedIds.length === 0) setSelecting(false);
            }}
            selected={selectedSteps}
          />
        )}
      </Stack>
    </Box>
  );
}

function StepCard({
  step,
  selecting = false,
  selected = false,
  onToggle,
}: {
  step: MyStepView;
  selecting?: boolean;
  selected?: boolean;
  onToggle?: (stepId: string) => void;
}) {
  const router = useRouter();
  const { m } = useI18n();
  const openable =
    step.sessionState === "STARTABLE" ||
    step.sessionState === "WORKING" ||
    step.sessionState === "PAUSED";
  // 一括に載せられる状態か。**対象外の行もチェックボックスは消さない** —
  // 無効で出しておくと「なぜ束ねられないか」が状態バッジと並んで読める。
  const selectable = batchActionsFor(step.sessionState).length > 0;
  const dimmed = selecting ? !selectable : !openable;
  const disabled = selecting ? !selectable : !openable;

  return (
    <UnstyledButton
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        if (selecting) onToggle?.(step.stepId);
        else router.push(`/steps/${step.stepId}`);
      }}
      style={{ opacity: dimmed ? 0.6 : 1 }}
    >
      <Paper p="md" radius="md" withBorder>
        <Group align="flex-start" justify="space-between" wrap="nowrap">
          {selecting && (
            <Checkbox
              checked={selected}
              disabled={!selectable}
              mt={4}
              onChange={() => onToggle?.(step.stepId)}
              size="lg"
              style={{ flexShrink: 0 }}
              tabIndex={-1}
            />
          )}
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Text c="dimmed" size="sm">
              {fillMessage(m.steps.card.workOrder, { n: step.workOrderNumber })}
              {step.plantName ? ` ${m.common.separator} ${step.plantName}` : ""}
              {step.workLocationName
                ? ` ${m.common.separator} ${step.workLocationName}`
                : ""}
            </Text>
            <Text fw={600} size="lg" truncate>
              {step.stepName}
            </Text>
            <Text c="dimmed" size="sm" truncate>
              {step.productName}
            </Text>
            <Group gap="md" mt={2}>
              {step.plannedStartAt && (
                <Text c="dimmed" size="sm">
                  {step.plannedEndAt
                    ? fillMessage(m.steps.card.plannedTime, {
                        start: step.plannedStartAt,
                        end: step.plannedEndAt,
                      })
                    : step.plannedStartAt}
                </Text>
              )}
              {step.plannedQuantityForMe != null && (
                <Text c="dimmed" size="sm">
                  {fillMessage(m.steps.card.plannedQty, {
                    n: step.plannedQuantityForMe,
                  })}
                </Text>
              )}
              {step.inputQuantity != null ? (
                <Text c="dimmed" size="sm">
                  {fillMessage(m.steps.card.inputRecorded, {
                    n: step.inputQuantity,
                  })}
                </Text>
              ) : (
                step.expectedInputQuantity != null && (
                  <Text c="dimmed" size="sm">
                    {fillMessage(m.steps.card.expectedInput, {
                      n: step.expectedInputQuantity,
                    })}
                  </Text>
                )
              )}
            </Group>
          </Stack>
          <Stack align="flex-end" gap={6} style={{ flexShrink: 0 }}>
            <Badge
              color={stateColor(step.sessionState)}
              size="lg"
              variant="light"
            >
              {stateLabel(m, step.sessionState, step.lockedByName)}
            </Badge>
            {step.workedMs > 0 && (
              <Text c="dimmed" size="sm">
                {m.steps.card.elapsedLabel}{" "}
                <LiveElapsed
                  baseMs={step.workedMs}
                  rate={1 / step.openConcurrentCount}
                  running={step.sessionState === "WORKING"}
                />
              </Text>
            )}
          </Stack>
        </Group>
      </Paper>
    </UnstyledButton>
  );
}
