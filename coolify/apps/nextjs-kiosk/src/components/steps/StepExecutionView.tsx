"use client";

/**
 * StepExecutionView.tsx — 工程の実行画面
 * （開始・一時停止・再開・完了 + 検査記録・不良記録・最終検査）。
 *
 * 分岐追加・中断（PENDING へ戻す）・巻き戻しは nextjs-web 側の管理画面に残す。
 * 検査記録は検査工程（is_inspection）でのみ、検査承認は検査承認工程
 * （is_approval_step）でのみ、最終検査・出荷前確認は最終検査工程
 * （is_final_inspection）でのみ、不良記録はすべての工程で、
 * 作業中 / 一時停止中に記録できる。
 *
 * 検査表確認（confirmedBy）も検査承認（approvedBy）もここで押せる。
 * 承認できる人かどうかは検査表の設定（承認グループ / 名指し）で決まり、
 * サーバーが記録ごとに解いて渡す — 画面は判断しない。
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
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCheck,
  IconMapPin,
  IconPlayerPause,
  IconPlayerPlay,
  IconQrcode,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fillMessage } from "@/lib/i18n";
import { missingInspectionSheets } from "@/lib/inspection-core";
import { QR_KINDS, qrKeyOfKind } from "@/lib/qr-payload";
import { playLogoutSound, playWarnSound } from "@/lib/sound";
import type { StepRecordingData } from "@/lib/step-records";
import type { MyStepView, StepLocationGate } from "@/lib/steps";
import {
  cleanReasonEntries,
  type DefectReasonEntry,
  quantitiesFromList,
} from "@/lib/steps-core";
import { ActivityMonitor } from "../ActivityMonitor";
import { useI18n } from "../I18nProvider";
import { QrScannerView } from "../QrScannerView";
import { LiveElapsed } from "./LiveElapsed";
import { NumberStepper } from "./NumberStepper";
import { StepDefectForm } from "./StepDefectForm";
import { StepFinalInspectionForm } from "./StepFinalInspectionForm";
import { StepInspectionApprovalPanel } from "./StepInspectionApprovalPanel";
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
  /** 工程マスタの許可作業場所 × この端末（表示用 — 権威は API 側）。 */
  locationGate: StepLocationGate;
  /** 戻り先: 担当工程一覧（既定） / 指示書スキャンの指示書ビュー。 */
  backTo?: "list" | "workOrder";
};

type Phase = "IDLE" | "STARTING" | "COMPLETING";

export function StepExecutionView({
  step,
  recording,
  locationGate,
  backTo = "list",
}: Props) {
  const router = useRouter();
  const { m } = useI18n();

  // 指示書スキャン経由なら戻り先はその指示書のビュー
  const backHref =
    backTo === "workOrder" ? `/wo-scan/${step.workOrderNumber}` : "/steps";
  const backLabel =
    backTo === "workOrder" ? m.woScan.backToWorkOrder : m.steps.backToList;

  const [phase, setPhase] = useState<Phase>("IDLE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 作業場所 QR（CKK:LOC:<code>）の読み取り。
  // 開始前 = code を保持して START に同送 / 作業中 = SET_LOCATION で即時反映。
  const [locationScanOpen, setLocationScanOpen] = useState(false);
  const [pendingLocationCode, setPendingLocationCode] = useState<string | null>(
    null,
  );
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  // 開始時の受入数（想定値を初期値に、作業者が上書きできる）
  const [startInput, setStartInput] = useState<number>(
    step.expectedInputQuantity ?? step.workOrderPlannedQuantity,
  );
  // 開始時のロット/伝票コード（REQUIRED は未入力だと開始できない）
  const [lotText, setLotText] = useState("");
  // 完了フォームの不良リスト（{種別, 理由, 数}）。良品・区分合計はここから導出。
  const [defects, setDefects] = useState<DefectReasonEntry[]>([]);

  // NONE を型レベルで落として、数量 UI に渡すモードを絞る
  const trackedMode = step.quantityMode === "NONE" ? null : step.quantityMode;
  const isNone = trackedMode === null;
  const working = step.sessionState === "WORKING";
  const paused = step.sessionState === "PAUSED";
  // 端末の「作業場所の制限」ON かつ端末の既定作業場所が許可外 → 開始/再開不可
  const locationBlocked =
    locationGate.enforced &&
    locationGate.restricted &&
    !locationGate.deviceAllowed;

  // 検査表が割り当てられている工程は、その検査表それぞれに記録が 1 件無いと
  // 完了できない（API 側が最終判定 — ここは押す前に理由を見せるためだけの写し）。
  const inspectionBlocked =
    missingInspectionSheets(
      recording.templates.map((t) => ({ id: t.id, name: t.name })),
      recording.inspectionRecords.map((r) => ({ templateId: r.templateId })),
    ).length > 0;

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
    run(
      {
        action: "START",
        inputQuantity: isNone ? null : startInput,
        lotText:
          step.lotInputMode !== "NONE" ? lotText.trim() || null : undefined,
        workLocationCode: pendingLocationCode ?? undefined,
      },
      () => {
        setPhase("IDLE");
        setPendingLocationCode(null);
        router.refresh();
      },
    );

  const handleLocationScan = (payload: string) => {
    const code = qrKeyOfKind(payload, QR_KINDS.WORK_LOCATION);
    if (!code) {
      playWarnSound();
      setError(m.steps.location.invalidQr);
      return;
    }
    setError(null);
    setLocationScanOpen(false);
    if (working) {
      run({ action: "SET_LOCATION", workLocationCode: code }, () => {
        setLocationNotice(m.steps.location.updated);
        router.refresh();
      });
    } else {
      // 開始前 — START と一緒に送る
      setPendingLocationCode(code);
    }
  };

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
        router.replace(backHref);
      },
    );

  return (
    <Box p="lg" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <ActivityMonitor />

      <Stack gap="lg" maw={720} mx="auto" style={{ flex: 1, width: "100%" }}>
        <Group justify="space-between" wrap="nowrap">
          <Button
            leftSection={<IconArrowLeft size={20} />}
            onClick={() => router.push(backHref)}
            variant="default"
          >
            {backLabel}
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
              {fillMessage(m.steps.card.workOrder, { n: step.workOrderNumber })}
              {step.plantName ? ` ${m.common.separator} ${step.plantName}` : ""}
              {step.workLocationName
                ? ` ${m.common.separator} ${step.workLocationName}`
                : ""}
            </Text>
            <Title order={3}>{step.stepName}</Title>
            <Text c="dimmed">{step.productName}</Text>
            <Group gap="md" mt="xs">
              {step.inputQuantity != null && (
                <Text size="sm">
                  {fillMessage(m.steps.card.inputRecorded, {
                    n: step.inputQuantity,
                  })}
                </Text>
              )}
              {step.lotText != null && (
                <Text c="dimmed" ff="monospace" size="sm">
                  {fillMessage(m.steps.card.lot, { t: step.lotText })}
                </Text>
              )}
              {step.plannedWorkHours != null && (
                <Text c="dimmed" size="sm">
                  {fillMessage(m.steps.card.plannedHours, {
                    h: step.plannedWorkHours,
                  })}
                </Text>
              )}
              {(working || paused) && (
                <Text c="dimmed" size="sm">
                  {m.steps.card.elapsedLabel}{" "}
                  <LiveElapsed
                    baseMs={step.workedMs}
                    rate={1 / step.openConcurrentCount}
                    running={working}
                  />
                </Text>
              )}
            </Group>
          </Stack>
        </Paper>

        {/* 作業場所の制限 — この端末の場所では実行できない工程 */}
        {locationBlocked && !working && (
          <Alert color="orange" icon={<IconAlertTriangle size={20} />}>
            <Stack gap="xs">
              <Text fw={600} size="sm">
                {m.steps.location.deviceBlockedTitle}
              </Text>
              <Text size="sm">
                {fillMessage(m.steps.location.deviceBlockedBody, {
                  label:
                    locationGate.deviceDefaultLabel ?? m.steps.location.none,
                })}
              </Text>
              {locationGate.allowed.length > 0 && (
                <Stack gap={2}>
                  <Text c="dimmed" size="sm">
                    {m.steps.location.allowedListTitle}
                  </Text>
                  {locationGate.allowed.map((a) => (
                    <Text key={a.label} size="sm">
                      {m.common.separator}
                      {a.label}
                      {a.deviceNames.length > 0
                        ? `（${fillMessage(m.steps.location.devicesAt, {
                            names: a.deviceNames.join(" / "),
                          })}）`
                        : ""}
                    </Text>
                  ))}
                </Stack>
              )}
            </Stack>
          </Alert>
        )}

        {/* 作業場所 — 実績に記録される場所（端末既定 or QR 読み取り） */}
        {(step.sessionState === "STARTABLE" ||
          working ||
          paused ||
          step.actualWorkLocationName != null ||
          pendingLocationCode != null) && (
          <Paper p="md" radius="md" withBorder>
            <Stack gap="sm">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap">
                  <IconMapPin size={20} />
                  <Text fw={600}>{m.steps.location.label}</Text>
                  <Text c={step.actualWorkLocationName ? undefined : "dimmed"}>
                    {step.actualWorkLocationName ?? m.steps.location.none}
                  </Text>
                </Group>
                {(step.sessionState === "STARTABLE" || working) &&
                  !locationBlocked && (
                    <Button
                      leftSection={<IconQrcode size={18} />}
                      onClick={() => setLocationScanOpen((v) => !v)}
                      size="sm"
                      variant="light"
                    >
                      {locationScanOpen
                        ? m.steps.location.close
                        : m.steps.location.scan}
                    </Button>
                  )}
              </Group>
              {pendingLocationCode != null &&
                step.sessionState === "STARTABLE" && (
                  <Text c="teal" size="sm">
                    {fillMessage(m.steps.location.pendingScanned, {
                      code: pendingLocationCode,
                    })}
                  </Text>
                )}
              {/* 開始前の案内は**どこが記録されるのかを名指しする**。以前は
                  「端末の既定作業場所が記録されます」とだけ出していたので、
                  (1) それがどこなのかは隠し設定画面を開くまで判らず、
                  (2) 既定が未設定でも同じ文が出て、記録されないのに
                  「記録されます」と読めていた。 */}
              {step.sessionState === "STARTABLE" &&
                pendingLocationCode == null && (
                  <Text
                    c={locationGate.deviceDefaultLabel ? "dimmed" : "orange"}
                    size="sm"
                  >
                    {locationGate.deviceDefaultLabel
                      ? fillMessage(m.steps.location.deviceDefaultHint, {
                          label: locationGate.deviceDefaultLabel,
                        })
                      : m.steps.location.deviceDefaultNone}
                  </Text>
                )}
              {locationNotice && (
                <Text c="teal" size="sm">
                  {locationNotice}
                </Text>
              )}
              {locationScanOpen && (
                <QrScannerView onScan={handleLocationScan} paused={busy} />
              )}
            </Stack>
          </Paper>
        )}

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
            {fillMessage(m.steps.state.othersWorking, {
              name: step.lockedByName ?? "",
            })}
          </Alert>
        )}

        {/* 開始 — 受入数の確認（NONE は数量を聞かない） */}
        {step.sessionState === "STARTABLE" && !locationBlocked && (
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
                      {fillMessage(m.steps.start.expectedHint, {
                        n: step.expectedInputQuantity,
                      })}
                      {startInput !== step.expectedInputQuantity
                        ? ` — ${m.steps.start.differsHint}`
                        : ""}
                    </Text>
                  )}
                </>
              )}
              {step.lotInputMode !== "NONE" && (
                <TextInput
                  label={
                    step.lotInputMode === "REQUIRED"
                      ? m.steps.start.lotRequired
                      : m.steps.start.lotOptional
                  }
                  maxLength={100}
                  onChange={(e) => setLotText(e.currentTarget.value)}
                  placeholder={m.steps.start.lotPlaceholder}
                  size="lg"
                  value={lotText}
                  withAsterisk={step.lotInputMode === "REQUIRED"}
                />
              )}
              <Button
                disabled={
                  step.lotInputMode === "REQUIRED" && lotText.trim() === ""
                }
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

        {/* ── その工程の「仕事」を先に置く ──────────────────────────────
            開始・一時停止・完了より**上**にあるのが要点。以前は完了ボタンの
            下に検査記録・検査承認が並んでいたので、現場は完了ボタンを通り
            過ぎて仕事をし、また上へ戻る必要があった（10 インチのタブレットで
            は 1 画面に収まらない）。上から順に「やること → 終わったら完了」と
            読める並びにする。 */}

        {/* 検査記録 — 検査工程のみ（既存記録があれば読み取り専用でも表示） */}
        {(recording.isInspection || recording.inspectionRecords.length > 0) && (
          <StepInspectionForm
            canRecord={recording.isInspection && (working || paused)}
            lotQuantity={
              step.inputQuantity ??
              step.expectedInputQuantity ??
              step.workOrderPlannedQuantity
            }
            records={recording.inspectionRecords}
            stepId={step.stepId}
            templates={recording.templates}
          />
        )}

        {/* 検査承認 — 検査承認工程のみ。指示書**全体**の検査記録を並べる
            （承認は「この指示書の検査がひととおり終わったか」を見る仕事）。 */}
        {recording.isApprovalStep && (
          <StepInspectionApprovalPanel
            canApprove={working || paused}
            records={recording.approvableRecords}
            stepId={step.stepId}
          />
        )}

        {/* 最終検査・出荷前確認 — 最終検査工程のみ（指示書 1 件に 1 行）。
            工程リストに最終検査工程が無い指示書には最終検査そのものが無い。 */}
        {recording.isFinalInspection && recording.finalInspection && (
          <StepFinalInspectionForm
            canRecord={working || paused}
            finalInspection={recording.finalInspection}
            stepId={step.stepId}
          />
        )}

        {/* 不良記録 — 全工程で任意（既存記録があれば読み取り専用でも表示） */}
        <StepDefectForm
          canRecord={working || paused}
          defectTypes={recording.defectTypes}
          records={recording.defectRecords}
          stepId={step.stepId}
        />
        {/* 進行中 / 一時停止中 — 完了フォームと操作。**仕事のあと**に置く。 */}
        {(working || paused) && (
          <Paper p="md" radius="md" withBorder>
            <Stack gap="md">
              {phase === "COMPLETING" ? (
                <>
                  <Title order={4}>{m.steps.complete.title}</Title>
                  {trackedMode === null ? (
                    <Text c="dimmed">
                      {fillMessage(m.steps.complete.noneNote, {
                        n:
                          step.inputQuantity ??
                          step.expectedInputQuantity ??
                          step.workOrderPlannedQuantity,
                      })}
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
                        inspectionBlocked ||
                        (!isNone &&
                          !isQuantityFormValid(
                            defects,
                            completeInput,
                            step.quantityMode,
                          ))
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
                <Stack gap="md">
                  {inspectionBlocked && (
                    <Alert
                      color="orange"
                      icon={<IconAlertTriangle size={20} />}
                    >
                      {m.steps.complete.blockedByInspection}
                    </Alert>
                  )}
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
                        disabled={locationBlocked}
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
                      disabled={inspectionBlocked}
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
                </Stack>
              )}
            </Stack>
          </Paper>
        )}
      </Stack>
    </Box>
  );
}
