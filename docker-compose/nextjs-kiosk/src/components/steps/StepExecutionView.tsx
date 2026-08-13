"use client";

/**
 * StepExecutionView.tsx — 工程の実行画面
 * （開始・一時停止・再開・完了 + 検査記録・不良記録）。
 *
 * 分岐追加・中断（PENDING へ戻す）・巻き戻し・検査承認は nextjs-web 側の
 * 管理画面に残す。検査記録は検査工程（is_inspection）でのみ、不良記録は
 * すべての工程で、作業中 / 一時停止中に記録できる。
 *
 * 一時停止は STEP_STATUS を変えず、ロックを解放して作業セッションを閉じる。
 * そのため「一時停止中」は他の端末からも再開でき、累計作業時間は
 * work_order_step_actuals の合算として正しく出る。
 */

import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  NumberInput,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCheck,
  IconPlayerPause,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { playLogoutSound } from "@/lib/sound";
import type { StepRecordingData } from "@/lib/step-records";
import type { MyStepView } from "@/lib/steps";
import {
  formatElapsed,
  type QuantityFormValues,
  quantityFormDefaults,
} from "@/lib/steps-core";
import { ActivityMonitor } from "../ActivityMonitor";
import { useI18n } from "../I18nProvider";
import { StepDefectForm } from "./StepDefectForm";
import { StepInspectionForm } from "./StepInspectionForm";
import { isQuantityFormValid, StepQuantityForm } from "./StepQuantityForm";
import {
  callStepAction,
  stateColor,
  stateLabel,
  translateError,
} from "./step-ui";

type Props = { step: MyStepView; recording: StepRecordingData };

type Phase = "IDLE" | "STARTING" | "COMPLETING";

export function StepExecutionView({ step, recording }: Props) {
  const router = useRouter();
  const { m } = useI18n();

  const [phase, setPhase] = useState<Phase>("IDLE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 開始時の受入数（想定値を初期値に、作業者が上書きできる）
  const [startInput, setStartInput] = useState<number>(
    step.expectedInputQuantity ?? step.workOrderPlannedQuantity,
  );
  const [quantities, setQuantities] = useState<QuantityFormValues>(() =>
    quantityFormDefaults(step.inputQuantity ?? step.expectedInputQuantity),
  );

  // NONE を型レベルで落として、数量 UI に渡すモードを絞る
  const trackedMode = step.quantityMode === "NONE" ? null : step.quantityMode;
  const isNone = trackedMode === null;
  const working = step.sessionState === "WORKING";
  const paused = step.sessionState === "PAUSED";

  // 作業中は経過時間を秒更新する（open な実績行は now まで数えられる）
  const [elapsed, setElapsed] = useState(step.workedMs);
  useEffect(() => {
    setElapsed(step.workedMs);
    if (!working) return;
    const started = Date.now();
    const base = step.workedMs;
    const id = setInterval(
      () => setElapsed(base + (Date.now() - started)),
      1000,
    );
    return () => clearInterval(id);
  }, [step.workedMs, working]);

  const run = async (
    body: Parameters<typeof callStepAction>[1],
    onDone?: () => void,
  ) => {
    setBusy(true);
    setError(null);
    const res = await callStepAction(step.stepId, body);
    setBusy(false);
    if (!res.ok) {
      setError(translateError(m, res));
      router.refresh(); // 競合（先に開始された等）は最新状態を出し直す
      return;
    }
    onDone?.();
  };

  const doStart = () =>
    run({ action: "START", inputQuantity: isNone ? null : startInput }, () => {
      setPhase("IDLE");
      router.refresh();
    });

  const doPause = () => run({ action: "PAUSE" }, () => router.refresh());
  const doResume = () => run({ action: "RESUME" }, () => router.refresh());

  const doComplete = () =>
    run(
      {
        action: "COMPLETE",
        quantities: isNone ? null : quantities,
      },
      () => {
        playLogoutSound();
        router.replace("/steps");
      },
    );

  return (
    <Box p="lg" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <ActivityMonitor />

      <Stack gap="lg" maw={720} mx="auto" style={{ flex: 1, width: "100%" }}>
        <Group justify="space-between" wrap="nowrap">
          <Button
            leftSection={<IconArrowLeft size={20} />}
            onClick={() => router.push("/steps")}
            variant="default"
          >
            {m.steps.back}
          </Button>
          <Badge
            color={stateColor(step.sessionState)}
            size="lg"
            variant="light"
          >
            {stateLabel(m, step.sessionState, step.lockedByName)}
          </Badge>
        </Group>

        <Paper p="md" radius="md" withBorder>
          <Stack gap={4}>
            <Text c="dimmed" size="sm">
              {m.steps.card.workOrder(step.workOrderNumber)}
              {step.factoryName ? ` ・ ${step.factoryName}` : ""}
            </Text>
            <Title order={3}>{step.stepName}</Title>
            <Text c="dimmed">{step.productName}</Text>
            <Group gap="md" mt="xs">
              {step.inputQuantity != null && (
                <Text size="sm">
                  {m.steps.card.inputRecorded(step.inputQuantity)}
                </Text>
              )}
              {(working || paused) && (
                <Text c="dimmed" size="sm">
                  {m.steps.card.elapsed(formatElapsed(elapsed))}
                </Text>
              )}
            </Group>
          </Stack>
        </Paper>

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={20} />}>
            {error}
          </Alert>
        )}

        {step.sessionState === "BLOCKED" && (
          <Alert color="gray" icon={<IconAlertTriangle size={20} />}>
            <Stack gap={4}>
              <Text size="sm">{m.steps.errors.NOT_STARTABLE}</Text>
              {step.blockReasons.map((r) => (
                <Text c="dimmed" key={r} size="sm">
                  {r}
                </Text>
              ))}
            </Stack>
          </Alert>
        )}

        {step.sessionState === "OTHER" && (
          <Alert color="orange" icon={<IconAlertTriangle size={20} />}>
            {m.steps.state.othersWorking(step.lockedByName ?? "")}
          </Alert>
        )}

        {/* 開始 — 受入数の確認（NONE は数量を聞かない） */}
        {step.sessionState === "STARTABLE" && (
          <Paper p="md" radius="md" withBorder>
            <Stack gap="md">
              <Title order={4}>{m.steps.start.title}</Title>
              {trackedMode === null ? (
                <Text c="dimmed">{m.steps.start.noneNote}</Text>
              ) : (
                <>
                  <NumberInput
                    allowDecimal={false}
                    allowNegative={false}
                    label={m.steps.quantity[trackedMode].input}
                    min={0}
                    onChange={(v) => {
                      const n =
                        typeof v === "number" ? v : Number.parseInt(v, 10);
                      setStartInput(Number.isFinite(n) ? n : 0);
                    }}
                    value={startInput}
                  />
                  {step.expectedInputQuantity != null && (
                    <Text c="dimmed" size="sm">
                      {m.steps.start.expectedHint(step.expectedInputQuantity)}
                      {startInput !== step.expectedInputQuantity
                        ? ` — ${m.steps.start.differsHint}`
                        : ""}
                    </Text>
                  )}
                </>
              )}
              <Button
                fullWidth
                leftSection={<IconPlayerPlay size={20} />}
                loading={busy && phase !== "COMPLETING"}
                onClick={doStart}
                size="lg"
              >
                {m.steps.actions.start}
              </Button>
            </Stack>
          </Paper>
        )}

        {/* 進行中 / 一時停止中 — 完了フォームと操作 */}
        {(working || paused) && (
          <Paper p="md" radius="md" withBorder>
            <Stack gap="md">
              {phase === "COMPLETING" ? (
                <>
                  <Title order={4}>{m.steps.complete.title}</Title>
                  {trackedMode === null ? (
                    <Text c="dimmed">
                      {m.steps.complete.noneNote(
                        step.inputQuantity ??
                          step.expectedInputQuantity ??
                          step.workOrderPlannedQuantity,
                      )}
                    </Text>
                  ) : (
                    <StepQuantityForm
                      mode={trackedMode}
                      onChange={setQuantities}
                      values={quantities}
                    />
                  )}
                  <Group grow>
                    <Button
                      disabled={busy}
                      onClick={() => setPhase("IDLE")}
                      size="lg"
                      variant="default"
                    >
                      {m.steps.actions.cancel}
                    </Button>
                    <Button
                      color="green"
                      disabled={
                        !isNone &&
                        !isQuantityFormValid(quantities, step.quantityMode)
                      }
                      leftSection={<IconCheck size={20} />}
                      loading={busy}
                      onClick={doComplete}
                      size="lg"
                    >
                      {m.steps.complete.submit}
                    </Button>
                  </Group>
                </>
              ) : (
                <Group grow>
                  {working ? (
                    <Button
                      color="orange"
                      leftSection={<IconPlayerPause size={20} />}
                      loading={busy}
                      onClick={doPause}
                      size="lg"
                      variant="light"
                    >
                      {m.steps.actions.pause}
                    </Button>
                  ) : (
                    <Button
                      leftSection={<IconPlayerPlay size={20} />}
                      loading={busy}
                      onClick={doResume}
                      size="lg"
                    >
                      {m.steps.actions.resume}
                    </Button>
                  )}
                  <Button
                    color="green"
                    leftSection={<IconCheck size={20} />}
                    onClick={() => {
                      setQuantities(
                        quantityFormDefaults(
                          step.inputQuantity ?? step.expectedInputQuantity,
                        ),
                      );
                      setPhase("COMPLETING");
                    }}
                    size="lg"
                  >
                    {m.steps.actions.complete}
                  </Button>
                </Group>
              )}
            </Stack>
          </Paper>
        )}

        {/* 検査記録 — 検査工程のみ（既存記録があれば読み取り専用でも表示） */}
        {(recording.isInspection || recording.inspectionRecords.length > 0) && (
          <StepInspectionForm
            canRecord={recording.isInspection && (working || paused)}
            records={recording.inspectionRecords}
            stepId={step.stepId}
            templates={recording.templates}
          />
        )}

        {/* 不良記録 — 全工程で任意（既存記録があれば読み取り専用でも表示） */}
        <StepDefectForm
          canRecord={working || paused}
          defectTypes={recording.defectTypes}
          records={recording.defectRecords}
          stepId={step.stepId}
        />
      </Stack>
    </Box>
  );
}
