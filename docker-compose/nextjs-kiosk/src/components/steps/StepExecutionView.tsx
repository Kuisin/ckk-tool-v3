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
import { useState } from "react";
import { playLogoutSound } from "@/lib/sound";
import type { StepRecordingData } from "@/lib/step-records";
import type { MyActiveStep, MyStepView } from "@/lib/steps";
import {
  cleanReasonEntries,
  type DefectReasonEntry,
  quantitiesFromList,
} from "@/lib/steps-core";
import { ActivityMonitor } from "../ActivityMonitor";
import { useI18n } from "../I18nProvider";
import { LiveElapsed } from "./LiveElapsed";
import { NumberStepper } from "./NumberStepper";
import { StepDefectForm } from "./StepDefectForm";
import { StepInspectionForm } from "./StepInspectionForm";
import { isQuantityFormValid, StepQuantityForm } from "./StepQuantityForm";
import {
  callStepAction,
  stateColor,
  stateLabel,
  translateError,
} from "./step-ui";

type Props = {
  step: MyStepView;
  recording: StepRecordingData;
  /** 自分が作業中の別工程（同時作業は 1 工程まで — 開始/再開をロック）。 */
  otherActive: MyActiveStep | null;
};

type Phase = "IDLE" | "STARTING" | "COMPLETING";

export function StepExecutionView({ step, recording, otherActive }: Props) {
  const router = useRouter();
  const { m } = useI18n();

  const [phase, setPhase] = useState<Phase>("IDLE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 開始時の受入数（想定値を初期値に、作業者が上書きできる）
  const [startInput, setStartInput] = useState<number>(
    step.expectedInputQuantity ?? step.workOrderPlannedQuantity,
  );
  // 完了フォームの不良リスト（{種別, 理由, 数}）。良品・区分合計はここから導出。
  const [defects, setDefects] = useState<DefectReasonEntry[]>([]);

  // NONE を型レベルで落として、数量 UI に渡すモードを絞る
  const trackedMode = step.quantityMode === "NONE" ? null : step.quantityMode;
  const isNone = trackedMode === null;
  const working = step.sessionState === "WORKING";
  const paused = step.sessionState === "PAUSED";
  // 別工程を作業中 → この工程の開始/再開/完了をロック（同時作業は 1 工程まで）
  const lockedByActive = otherActive != null && !working;

  // 完了時の受入数は開始時に確定した値で固定（未記録なら想定/予定へフォールバック）
  const completeInput =
    step.inputQuantity ??
    step.expectedInputQuantity ??
    step.workOrderPlannedQuantity;

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
        // 区分列・良品はリストから導出して送る（サーバーもリストから再計算）
        quantities: isNone ? null : quantitiesFromList(completeInput, defects),
        defectReasons: isNone ? undefined : cleanReasonEntries(defects),
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
            {m.steps.backToList}
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
                  {m.steps.card.elapsedLabel}{" "}
                  <LiveElapsed baseMs={step.workedMs} running={working} />
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

        {/* 別工程を作業中 — 開始/再開/完了の代わりに誘導を出す */}
        {lockedByActive && otherActive && (
          <Alert color="orange" icon={<IconAlertTriangle size={20} />}>
            <Stack align="flex-start" gap="sm">
              <Text size="sm">
                {m.steps.activeLock.alert(
                  otherActive.workOrderNumber,
                  otherActive.stepName,
                )}
              </Text>
              <Button
                onClick={() => router.push(`/steps/${otherActive.stepId}`)}
                size="sm"
                variant="light"
              >
                {m.steps.activeLock.goto}
              </Button>
            </Stack>
          </Alert>
        )}

        {/* 開始 — 受入数の確認（NONE は数量を聞かない） */}
        {step.sessionState === "STARTABLE" && !lockedByActive && (
          <Paper p="md" radius="md" withBorder>
            <Stack gap="md">
              <Title order={4}>{m.steps.start.title}</Title>
              {trackedMode === null ? (
                <Text c="dimmed">{m.steps.start.noneNote}</Text>
              ) : (
                <>
                  <NumberStepper
                    label={m.steps.quantity[trackedMode].input}
                    min={0}
                    onChange={setStartInput}
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
        {(working || paused) && !lockedByActive && (
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
                      defects={defects}
                      defectTypes={recording.defectTypes}
                      inputQuantity={completeInput}
                      mode={trackedMode}
                      onChange={setDefects}
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
                        !isQuantityFormValid(
                          defects,
                          completeInput,
                          step.quantityMode,
                        )
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
                      setDefects([]);
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
