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
  IconClipboardList,
  IconRefresh,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MyStepView } from "@/lib/steps";
import type { StepBucket } from "@/lib/steps-core";
import { formatElapsed } from "@/lib/steps-core";
import { ActivityMonitor } from "../ActivityMonitor";
import { useI18n } from "../I18nProvider";
import { stateColor, stateLabel } from "./step-ui";

type Props = {
  steps: MyStepView[];
  upcomingCount: number;
};

const SECTION_ORDER: StepBucket[] = ["OVERDUE", "TODAY", "UPCOMING"];

export function StepListView({ steps, upcomingCount }: Props) {
  const router = useRouter();
  const { m } = useI18n();
  const [refreshing, setRefreshing] = useState(false);

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
                {m.steps.upcoming(upcomingCount)}
              </Badge>
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
                  <StepCard key={step.stepId} step={step} />
                ))}
              </Stack>
            );
          })
        )}
      </Stack>
    </Box>
  );
}

function StepCard({ step }: { step: MyStepView }) {
  const router = useRouter();
  const { m } = useI18n();
  const openable =
    step.sessionState === "STARTABLE" ||
    step.sessionState === "WORKING" ||
    step.sessionState === "PAUSED";

  return (
    <UnstyledButton
      disabled={!openable}
      onClick={() => openable && router.push(`/steps/${step.stepId}`)}
      style={{ opacity: openable ? 1 : 0.6 }}
    >
      <Paper p="md" radius="md" withBorder>
        <Group align="flex-start" justify="space-between" wrap="nowrap">
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Text c="dimmed" size="sm">
              {m.steps.card.workOrder(step.workOrderNumber)}
              {step.factoryName ? ` ・ ${step.factoryName}` : ""}
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
                    ? m.steps.card.plannedTime(
                        step.plannedStartAt,
                        step.plannedEndAt,
                      )
                    : step.plannedStartAt}
                </Text>
              )}
              {step.plannedQuantityForMe != null && (
                <Text c="dimmed" size="sm">
                  {m.steps.card.plannedQty(step.plannedQuantityForMe)}
                </Text>
              )}
              {step.inputQuantity != null ? (
                <Text c="dimmed" size="sm">
                  {m.steps.card.inputRecorded(step.inputQuantity)}
                </Text>
              ) : (
                step.expectedInputQuantity != null && (
                  <Text c="dimmed" size="sm">
                    {m.steps.card.expectedInput(step.expectedInputQuantity)}
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
                {m.steps.card.elapsed(formatElapsed(step.workedMs))}
              </Text>
            )}
          </Stack>
        </Group>
      </Paper>
    </UnstyledButton>
  );
}
