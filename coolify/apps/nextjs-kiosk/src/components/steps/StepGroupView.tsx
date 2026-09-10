"use client";

/**
 * StepGroupView.tsx — 同じ工程を指示書ごとに並べ、まとめて記録する画面。
 *
 * 1 台の機械で同じ工程の指示書を何本も回すときのための画面。一覧の一括操作と
 * 違うのは **行ごとの入力欄を持てる**こと — とくに ロット/伝票コードは指示書
 * ごとに違う値なので、一覧側の一括開始では扱えず（LOT_REQUIRED で落ちる）
 * ここが唯一の入口になる。
 *
 * 完了は**全数良品**のみ。サーバーは種類 FK + 詳細の無い不良を拒否するので
 * 「不良数だけ打って進む」道はそもそも無く、不良のある工程は「開く」から
 * 個別の画面で内訳を入れてもらう。
 */

import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconAlertTriangle, IconArrowLeft } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fillMessage } from "@/lib/i18n";
import { batchIneligibility } from "@/lib/step-batch-core";
import type { MyStepView } from "@/lib/steps";
import { useI18n } from "../I18nProvider";
import { callBatchStepAction, stateColor, stateLabel } from "./step-ui";

type Props = { steps: MyStepView[] };

export function StepGroupView({ steps }: Props) {
  const router = useRouter();
  const { m } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [lots, setLots] = useState<Record<string, string>>({});

  const stepName = steps[0]?.stepName ?? "";
  const startable = steps.filter((s) => s.sessionState === "STARTABLE");
  const working = steps.filter(
    (s) => s.sessionState === "WORKING" || s.sessionState === "PAUSED",
  );
  const other = steps.filter(
    (s) => !startable.includes(s) && !working.includes(s),
  );

  const selectedSet = new Set(selected);
  const toggle = (id: string) =>
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id],
    );

  /** ロット必須なのに未入力の行は開始に載せない（サーバーも同じ判定をする）。 */
  const lotMissing = (s: MyStepView) =>
    s.lotInputMode === "REQUIRED" && (lots[s.stepId] ?? "").trim() === "";

  const startTargets = startable.filter(
    (s) => selectedSet.has(s.stepId) && !lotMissing(s),
  );
  const completeTargets = working.filter(
    (s) =>
      selectedSet.has(s.stepId) &&
      batchIneligibility(
        {
          inspectionMissing: s.inspectionMissing,
          lotInputMode: s.lotInputMode,
          quantityMode: s.quantityMode,
          sessionState: s.sessionState,
          stepId: s.stepId,
        },
        "COMPLETE",
      ) == null,
  );

  const run = async (action: "START" | "COMPLETE", targets: MyStepView[]) => {
    if (targets.length === 0) return;
    setBusy(true);
    setError(null);
    const res = await callBatchStepAction({
      action,
      stepIds: targets.map((s) => s.stepId),
      ...(action === "START"
        ? {
            lotTexts: Object.fromEntries(
              targets
                .map((s) => [s.stepId, (lots[s.stepId] ?? "").trim()])
                .filter(([, v]) => v !== ""),
            ) as Record<string, string>,
          }
        : {}),
    });
    setBusy(false);
    if (!res.ok) {
      const first = res.results.find((r) => !r.ok);
      setError(
        first
          ? `${fillMessage(m.steps.batch.resultMixed, {
              ng: res.summary.failed,
              ok: res.summary.succeeded,
            })}`
          : m.steps.errors.UNKNOWN,
      );
    }
    setSelected([]);
    router.refresh();
  };

  return (
    <Box p="lg" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <Stack gap="lg" maw={960} mx="auto" style={{ flex: 1, width: "100%" }}>
        <Group gap="sm" wrap="nowrap">
          <Button
            leftSection={<IconArrowLeft size={20} />}
            onClick={() => router.push("/steps")}
            variant="default"
          >
            {m.steps.group.back}
          </Button>
          <Title order={3}>
            {fillMessage(m.steps.group.title, {
              n: steps.length,
              name: stepName,
            })}
          </Title>
        </Group>

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={20} />}>
            {error}
          </Alert>
        )}

        {startable.length > 0 && (
          <Stack gap="sm">
            <Text c="dimmed" fw={600} size="sm">
              {m.steps.group.sectionStartable}
            </Text>
            {startable.map((s) => (
              <GroupRow
                key={s.stepId}
                lot={lots[s.stepId] ?? ""}
                lotMissing={lotMissing(s)}
                onLot={(v) => setLots((l) => ({ ...l, [s.stepId]: v }))}
                onToggle={() => toggle(s.stepId)}
                selected={selectedSet.has(s.stepId)}
                showLot={s.lotInputMode !== "NONE"}
                step={s}
              />
            ))}
            <Button
              disabled={startTargets.length === 0}
              loading={busy}
              onClick={() => run("START", startTargets)}
              size="lg"
            >
              {fillMessage(m.steps.group.startSelected, {
                n: startTargets.length,
              })}
            </Button>
          </Stack>
        )}

        {working.length > 0 && (
          <Stack gap="sm">
            <Text c="dimmed" fw={600} size="sm">
              {m.steps.group.sectionWorking}
            </Text>
            <Alert color="yellow" icon={<IconAlertTriangle size={20} />}>
              {m.steps.group.allGoodNote}
            </Alert>
            {working.map((s) => (
              <GroupRow
                key={s.stepId}
                onToggle={() => toggle(s.stepId)}
                selected={selectedSet.has(s.stepId)}
                step={s}
              />
            ))}
            <Button
              color="green"
              disabled={completeTargets.length === 0}
              loading={busy}
              onClick={() => run("COMPLETE", completeTargets)}
              size="lg"
            >
              {fillMessage(m.steps.group.completeSelected, {
                n: completeTargets.length,
              })}
            </Button>
          </Stack>
        )}

        {other.length > 0 && (
          <Stack gap="sm">
            <Text c="dimmed" fw={600} size="sm">
              {m.steps.group.sectionOther}
            </Text>
            {other.map((s) => (
              <GroupRow key={s.stepId} step={s} />
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

function GroupRow({
  step,
  selected = false,
  onToggle,
  showLot = false,
  lot = "",
  lotMissing = false,
  onLot,
}: {
  step: MyStepView;
  selected?: boolean;
  onToggle?: () => void;
  showLot?: boolean;
  lot?: string;
  lotMissing?: boolean;
  onLot?: (v: string) => void;
}) {
  const router = useRouter();
  const { m } = useI18n();

  return (
    <Paper p="md" radius="md" withBorder>
      <Group align="flex-start" justify="space-between" wrap="nowrap">
        <Group
          align="flex-start"
          gap="sm"
          style={{ minWidth: 0 }}
          wrap="nowrap"
        >
          {onToggle && (
            <Checkbox
              checked={selected}
              mt={4}
              onChange={onToggle}
              size="lg"
              style={{ flexShrink: 0 }}
            />
          )}
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Text fw={600} size="lg">
              {fillMessage(m.steps.card.workOrder, {
                n: step.workOrderNumber,
              })}
            </Text>
            <Text c="dimmed" size="sm" truncate>
              {step.productName}
            </Text>
            <Group gap="md">
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
              {step.lotText && (
                <Text c="dimmed" size="sm">
                  {fillMessage(m.steps.card.lot, { t: step.lotText })}
                </Text>
              )}
            </Group>
            {showLot && onLot && (
              <TextInput
                error={lotMissing ? m.steps.group.lotRequired : undefined}
                label={m.steps.group.lotLabel}
                onChange={(e) => onLot(e.currentTarget.value)}
                size="md"
                value={lot}
                withAsterisk={step.lotInputMode === "REQUIRED"}
              />
            )}
          </Stack>
        </Group>
        <Stack align="flex-end" gap={6} style={{ flexShrink: 0 }}>
          <Badge
            color={stateColor(step.sessionState)}
            size="lg"
            variant="light"
          >
            {stateLabel(m, step.sessionState, step.lockedByName)}
          </Badge>
          {step.inspectionMissing && (
            <Badge color="orange" size="sm" variant="outline">
              {m.steps.batch.reasonInspectionRequired}
            </Badge>
          )}
          <Button
            onClick={() => router.push(`/steps/${step.stepId}`)}
            size="compact-sm"
            variant="subtle"
          >
            {m.steps.group.openOne}
          </Button>
        </Stack>
      </Group>
    </Paper>
  );
}
