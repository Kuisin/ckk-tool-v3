"use client";

/**
 * WoStepsView.tsx — スキャンした指示書の工程一覧。
 *
 * 紙の指示書と突き合わせる画面なので**全工程**を工程順で出す。
 * 開けるのは行レベルゲートを通る工程（自分の計画 / 未計画）のうち
 * 開始可・作業中・一時停止中のもの — 行き先は /steps/[stepId]?from=wo
 * （実行画面の戻り先がこの画面になる）。
 */

import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Paper,
  Progress,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconQrcode,
  IconRefresh,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fillMessage } from "@/lib/i18n";
import type { WorkOrderOverview, WorkOrderStepItem } from "@/lib/steps";
import { ActivityMonitor } from "../ActivityMonitor";
import { useI18n } from "../I18nProvider";
import { stateColor, stateLabel } from "../steps/step-ui";

type Props = {
  workOrderNumber: number;
  /** null = 指示書が存在しない（「見つかりません」画面を出す）。 */
  overview: WorkOrderOverview | null;
};

/** WORK_ORDER_STATUS → バッジ色（design.md §9 と同じ対応）。 */
const WO_STATUS_COLOR: Record<string, string> = {
  DRAFT: "gray",
  PENDING_APPROVAL: "yellow",
  APPROVED: "blue",
  IN_PROGRESS: "violet",
  COMPLETED: "green",
  CANCELLED: "red",
};

export function WoStepsView({ workOrderNumber, overview }: Props) {
  const router = useRouter();
  const { m } = useI18n();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = () => {
    setRefreshing(true);
    router.refresh();
    // router.refresh() は完了を待てないので、視覚的な二度押し防止だけ行う
    setTimeout(() => setRefreshing(false), 600);
  };

  const statusLabel = (status: string) =>
    (m.woScan.status as Record<string, string | undefined>)[status] ?? status;

  // 工程を操作できる指示書状態か（サーバー側の権威は WO_NOT_APPROVED ゲート）
  const executable =
    overview != null &&
    (overview.status === "APPROVED" || overview.status === "IN_PROGRESS");

  // 進捗（キャンセル工程は分母から除く）
  const countable =
    overview?.steps.filter((i) => i.step.sessionState !== "CANCELLED") ?? [];
  const doneCount = countable.filter(
    (i) => i.step.sessionState === "COMPLETED",
  ).length;

  return (
    <Box p="lg" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <ActivityMonitor />

      <Stack gap="lg" maw={960} mx="auto" style={{ flex: 1, width: "100%" }}>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Button
              leftSection={<IconArrowLeft size={20} />}
              onClick={() => router.push("/wo-scan")}
              variant="default"
            >
              {m.woScan.rescan}
            </Button>
            <Title order={3}>
              {fillMessage(m.woScan.workOrder, { n: workOrderNumber })}
            </Title>
            {overview && (
              <Badge
                color={WO_STATUS_COLOR[overview.status] ?? "gray"}
                size="lg"
                variant="light"
              >
                {statusLabel(overview.status)}
              </Badge>
            )}
          </Group>
          {overview && (
            <Button
              leftSection={<IconRefresh size={20} />}
              loading={refreshing}
              onClick={refresh}
              variant="default"
            >
              {m.steps.refresh}
            </Button>
          )}
        </Group>

        {overview == null ? (
          <Center style={{ flex: 1 }}>
            <Stack align="center" gap="sm">
              <ThemeIcon color="orange" radius="md" size={64} variant="light">
                <IconQrcode size={36} />
              </ThemeIcon>
              <Text c="dimmed">
                {fillMessage(m.woScan.notFound, { n: workOrderNumber })}
              </Text>
              <Button onClick={() => router.push("/wo-scan")}>
                {m.woScan.rescan}
              </Button>
            </Stack>
          </Center>
        ) : (
          <>
            <Paper p="md" radius="md" withBorder>
              <Stack gap={6}>
                <Text fw={600} size="lg">
                  {overview.productName}
                </Text>
                <Group gap="md">
                  <Text c="dimmed" size="sm">
                    {fillMessage(m.woScan.plannedQty, {
                      n: overview.plannedQuantity,
                    })}
                  </Text>
                  {overview.materialName && (
                    <Text c="dimmed" size="sm">
                      {fillMessage(m.woScan.material, {
                        name: overview.materialName,
                      })}
                    </Text>
                  )}
                </Group>
                {countable.length > 0 && (
                  <Group align="center" gap="sm" mt={2} wrap="nowrap">
                    <Progress
                      color={doneCount === countable.length ? "teal" : "blue"}
                      size="sm"
                      style={{ flex: 1 }}
                      value={(doneCount / countable.length) * 100}
                    />
                    <Text c="dimmed" size="sm" style={{ whiteSpace: "nowrap" }}>
                      {fillMessage(m.woScan.progress, {
                        done: doneCount,
                        total: countable.length,
                      })}
                    </Text>
                  </Group>
                )}
              </Stack>
            </Paper>

            {!executable && (
              <Alert color="orange" icon={<IconAlertTriangle size={20} />}>
                {m.woScan.notExecutable}
              </Alert>
            )}

            <Title c="dimmed" order={5}>
              {m.woScan.stepsTitle}
            </Title>

            {overview.steps.length === 0 ? (
              <Text c="dimmed">{m.woScan.noSteps}</Text>
            ) : (
              <Stack gap="sm">
                {overview.steps.map((item, i) => (
                  <WoStepCard
                    executable={executable}
                    index={i + 1}
                    item={item}
                    key={item.step.stepId}
                  />
                ))}
              </Stack>
            )}
          </>
        )}
      </Stack>
    </Box>
  );
}

function WoStepCard({
  item,
  index,
  executable,
}: {
  item: WorkOrderStepItem;
  /** 工程順の表示番号（1..N — 紙の指示書との突き合わせ用）。 */
  index: number;
  /** 指示書が承認済み/進行中か（false のとき工程は開けない）。 */
  executable: boolean;
}) {
  const router = useRouter();
  const { m } = useI18n();
  const { step } = item;

  const openable =
    executable &&
    item.canOperate &&
    (step.sessionState === "STARTABLE" ||
      step.sessionState === "WORKING" ||
      step.sessionState === "PAUSED");

  return (
    <UnstyledButton
      disabled={!openable}
      onClick={() => openable && router.push(`/steps/${step.stepId}?from=wo`)}
      style={{ opacity: openable ? 1 : 0.6 }}
    >
      <Paper p="md" radius="md" withBorder>
        <Group align="flex-start" justify="space-between" wrap="nowrap">
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="nowrap">
              <Text fw={600} size="lg" truncate>
                {index}. {step.stepName}
              </Text>
              {step.executionLocation === "OUTSOURCE" && (
                <Badge color="orange" size="sm" variant="outline">
                  {m.steps.card.outsource}
                </Badge>
              )}
            </Group>
            <Text c="dimmed" size="sm" truncate>
              {item.assigneeNames.length > 0
                ? fillMessage(m.woScan.assignees, {
                    names: item.assigneeNames.join(" / "),
                  })
                : m.woScan.unplanned}
              {step.plantName ? ` ${m.common.separator} ${step.plantName}` : ""}
              {step.workLocationName
                ? ` ${m.common.separator} ${step.workLocationName}`
                : ""}
            </Text>
            <Group gap="sm" mt={2} wrap="wrap">
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
              {step.outputSuccessQuantity != null && (
                <Text c="green" size="sm">
                  {fillMessage(m.steps.card.okOutput, {
                    n: step.outputSuccessQuantity,
                  })}
                </Text>
              )}
              {(step.defectSemiFinished ?? 0) > 0 && (
                <Badge color="orange" size="sm" variant="light">
                  {m.steps.quantity.FLOW.semi} {step.defectSemiFinished}
                </Badge>
              )}
              {(step.defectScrap ?? 0) > 0 && (
                <Badge color="red" size="sm" variant="light">
                  {m.steps.quantity.FLOW.scrap} {step.defectScrap}
                </Badge>
              )}
              {(step.defectRework ?? 0) > 0 && (
                <Badge color="yellow" size="sm" variant="light">
                  {m.steps.quantity.FLOW.rework} {step.defectRework}
                </Badge>
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
            {!item.canOperate && step.sessionState !== "COMPLETED" && (
              <Badge color="gray" size="sm" variant="outline">
                {m.woScan.plannedForOthers}
              </Badge>
            )}
          </Stack>
        </Group>
      </Paper>
    </UnstyledButton>
  );
}
