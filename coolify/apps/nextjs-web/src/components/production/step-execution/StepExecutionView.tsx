"use client";

/**
 * StepExecutionView — 工程実行画面 (design.md §12.3 / §20.1)。
 *
 * スプリットパネルの右ペイン向けにコンパクト表示（テーマ既定 size="sm"）。
 * 現場のタブレット操作はキオスク（nextjs-kiosk /steps）が担う。
 * 構成: 工程アイデンティティ Paper → セッションロック Alert →
 * [PENDING] 開始可否 + 工程開始 → [IN_PROGRESS] 数量入力 + 検査記録 +
 * 不良記録 + 中断（巻き戻し）→ [COMPLETED] 数量サマリ + 巻き戻し。
 * 最終検査工程（カタログの印）では 最終検査・出荷前確認 もここで記録する
 * （指示書 1 件に 1 行 — 以前は指示書詳細に常設していた）。
 * 外注工程は 依頼日 / 入荷予定日 / 入荷日 を編集できる。
 */

import {
  Alert,
  Badge,
  Button,
  Group,
  List,
  NumberInput,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import {
  IconArrowBackUp,
  IconCalendar,
  IconCheck,
  IconLock,
  IconPlayerPlay,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  abortStep,
  completeStep,
  rollbackStep,
  saveOutsourceDates,
  startStep,
  updateStepLot,
} from "@/app/(dashboard)/production/work-orders/[id]/steps/[stepId]/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { DefectRecordForm } from "@/components/production/DefectRecordForm";
import {
  InspectionApprovalPanel,
  InspectionRecordForm,
} from "@/components/production/InspectionRecordForm";
import { StepPlanActualPanel } from "@/components/production/StepPlanActualPanel";
import { StepQuantityForm } from "@/components/production/StepQuantityForm";
import { WorkOrderFinalInspectionPanel } from "@/components/production/WorkOrderFinalInspectionPanel";
import { PrimaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { ModalShell } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { localizedQuantityLabels } from "@/lib/workflow-core-labels";
import type { StepExecutionData } from "./model";
import { StepInspectionSheetModal } from "./StepInspectionSheetModal";

const BASE_PATH = "/production/work-orders";

export function StepExecutionView({ data }: { data: StepExecutionData }) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { step, workOrderNumber } = data;
  // 書類番号 WO-YYYYMM-NNNNN（内部キーは通し連番の int のまま）。
  const woLabel = data.workOrderDocNumber;

  // 中断 / 巻き戻し 理由モーダル
  const [reasonMode, setReasonMode] = useState<"abort" | "rollback" | null>(
    null,
  );
  const [reason, setReason] = useState("");

  // ロット/伝票コード（開始時に記録・進行中は修正可）
  const [lotText, setLotText] = useState(step.lotText ?? "");

  // 外注日程
  const [requestedAt, setRequestedAt] = useState<string | null>(
    step.outsourceRequestedAt,
  );
  const [expectedAt, setExpectedAt] = useState<string | null>(
    step.outsourceExpectedAt,
  );
  const [receivedAt, setReceivedAt] = useState<string | null>(
    step.outsourceReceivedAt,
  );
  const [outsourceCost, setOutsourceCost] = useState<number | "">(
    step.outsourceCost ?? "",
  );

  const isOutsource = step.executionLocation === "OUTSOURCE";
  const qtyLabels = localizedQuantityLabels(tr, step.quantityTracking);
  const lockedByOther =
    step.sessionLockedBy != null && step.sessionLockedBy !== data.actorId;
  const woExecutable =
    data.workOrderStatus === "APPROVED" ||
    data.workOrderStatus === "IN_PROGRESS";
  const canOperate = woExecutable && !lockedByOther;

  const notifyResult = (
    result: { ok: boolean; errors?: string[] },
    successTitle: string,
    fallback: string,
  ) => {
    if (result.ok) {
      notifications.show({
        title: successTitle,
        message: tr("production.stepExecutionView.stepWithName", {
          name: step.name,
        }),
        color: "green",
      });
      router.refresh();
    } else {
      notifications.show({
        title: tr("common.error2"),
        message: result.errors?.join(" / ") ?? fallback,
        color: "red",
      });
    }
  };

  const handleStart = () => {
    startTransition(async () => {
      const result = await startStep(
        workOrderNumber,
        step.id,
        lotText.trim() || null,
      );
      notifyResult(
        result,
        tr("production.stepExecution.theStepWasStarted"),
        tr("production.stepExecution.couldNotStartTheStep"),
      );
    });
  };

  const handleSaveLot = () => {
    startTransition(async () => {
      const result = await updateStepLot(workOrderNumber, step.id, lotText);
      notifyResult(
        result,
        tr("production.stepExecution.theLotSlipCodeWasSaved"),
        tr("production.stepExecution.couldNotSaveTheLotSlip"),
      );
    });
  };

  /** 数量管理なし（NONE）工程の完了 — 数量はサーバーがパススルー生成する。 */
  const handleCompleteWithoutQuantities = () => {
    startTransition(async () => {
      const result = await completeStep(workOrderNumber, step.id, null);
      notifyResult(
        result,
        tr("common.stepCompleted"),
        tr("common.couldNotCompleteTheStep"),
      );
    });
  };

  const handleReasonConfirm = () => {
    if (!reason.trim()) {
      notifications.show({
        title: tr("common.missingInput"),
        message: tr("common.enterAReason2"),
        color: "red",
      });
      return;
    }
    const mode = reasonMode;
    startTransition(async () => {
      const result =
        mode === "abort"
          ? await abortStep(workOrderNumber, step.id, reason)
          : await rollbackStep(workOrderNumber, step.id, reason);
      if (result.ok) {
        setReasonMode(null);
        setReason("");
      }
      notifyResult(
        result,
        mode === "abort"
          ? tr("production.stepExecutionView.theStepWasAborted")
          : tr("production.stepExecution.theStepWasRolledBack"),
        tr("common.theActionFailed"),
      );
    });
  };

  const handleSaveOutsourceDates = () => {
    startTransition(async () => {
      const result = await saveOutsourceDates({
        workOrderNumber,
        stepId: step.id,
        requestedAt,
        expectedAt,
        receivedAt,
        outsourceCost: outsourceCost === "" ? null : outsourceCost,
      });
      notifyResult(
        result,
        tr("production.stepExecution.theOutsourcingScheduleWasSaved"),
        tr("production.stepExecution.couldNotSaveTheOutsourcingSchedule"),
      );
    });
  };

  return (
    <Stack gap="md">
      {/* ── 工程アイデンティティ ── */}
      <Paper p="md" radius="md" withBorder>
        <Stack gap="xs">
          <Group justify="space-between" wrap="wrap">
            <Group gap="sm" wrap="wrap">
              <Title order={4}>{step.name}</Title>
              <StatusBadge entity="Step" status={step.status} />
              <Badge
                color={isOutsource ? "orange" : "gray"}
                size="sm"
                variant="outline"
              >
                {isOutsource ? "外注" : tr("common.inHouse")}
              </Badge>
              {step.isInspection && (
                <Badge color="blue" size="sm" variant="light">
                  {tr("common.inspection")}
                </Badge>
              )}
              {step.isApprovalStep && (
                <Badge color="teal" size="sm" variant="light">
                  {tr("common.inspectionApproval")}
                </Badge>
              )}
              {step.isFinalInspection && (
                <Badge color="orange" size="sm" variant="light">
                  {tr("common.finalInspection")}
                </Badge>
              )}
            </Group>
            <Link href={`${BASE_PATH}/${workOrderNumber}`}>
              <DocNumber c="blue">指示書 {woLabel}</DocNumber>
            </Link>
          </Group>
          <Group gap="xl" wrap="wrap">
            <Text c="dimmed" size="sm">
              実施先:{" "}
              {(isOutsource ? step.supplierName : step.plantName) ?? "—"}
            </Text>
            <Text c="dimmed" size="sm">
              予定数量: {data.plannedQuantity}
            </Text>
            {step.plannedWorkHours != null && (
              <Text c="dimmed" size="sm">
                予定作業時間: {step.plannedWorkHours} h
              </Text>
            )}
            {step.startedAt && (
              <Text c="dimmed" size="sm">
                開始: {fmt.dateTime(step.startedAt)}
                {step.startedByName ? `（${step.startedByName}）` : ""}
              </Text>
            )}
            {step.completedAt && (
              <Text c="dimmed" size="sm">
                完了: {fmt.dateTime(step.completedAt)}
                {step.completedByName ? `（${step.completedByName}）` : ""}
              </Text>
            )}
          </Group>
        </Stack>
      </Paper>

      {/* ── セッションロック警告 ── */}
      {lockedByOther && (
        <Alert
          color="red"
          icon={<IconLock size={16} />}
          title={tr("production.stepExecution.anotherUserHasThisSessionOpen")}
          variant="filled"
        >
          {step.sessionLockedByName ??
            tr("production.stepExecution.anotherUser")}
          がこの工程を操作しています。完了または中断されるまで操作できません。
        </Alert>
      )}

      {/* ── ロット/伝票コード（開始時に記録・進行中は修正可） ── */}
      {step.status !== "PENDING" &&
        (step.lotInputMode !== "NONE" || step.lotText != null) &&
        (step.status === "IN_PROGRESS" && canOperate ? (
          <Paper p="md" radius="md" withBorder>
            <Group align="flex-end" gap="sm">
              <TextInput
                label={tr("production.stepExecution.lotSlipCode")}
                maxLength={100}
                onChange={(e) => setLotText(e.currentTarget.value)}
                style={{ flex: 1 }}
                value={lotText}
                withAsterisk={step.lotInputMode === "REQUIRED"}
              />
              <Button
                disabled={(lotText.trim() || null) === (step.lotText ?? null)}
                loading={isPending}
                onClick={handleSaveLot}
                variant="default"
              >
                {tr("common.save2")}
              </Button>
            </Group>
          </Paper>
        ) : (
          <Paper p="md" radius="md" withBorder>
            <FieldValue
              label={tr("production.stepExecution.lotSlipCode")}
              value={step.lotText ?? "—"}
            />
          </Paper>
        ))}

      {/* ── PENDING: 開始可否・工程開始 ── */}
      {step.status === "PENDING" &&
        (!woExecutable ? (
          <Alert
            color="yellow"
            title={tr("production.stepExecution.cannotStart")}
            variant="light"
          >
            {tr("production.stepExecution.theStepCannotStartBecauseThe")}
          </Alert>
        ) : data.canStart.ok && !lockedByOther ? (
          <Stack gap="sm" mt="md">
            {step.lotInputMode !== "NONE" && (
              <TextInput
                description={tr(
                  "production.stepExecution.materialLotSlipCodeAndSo",
                )}
                label={tr("production.stepExecution.lotSlipCode")}
                maxLength={100}
                onChange={(e) => setLotText(e.currentTarget.value)}
                placeholder={
                  step.lotInputMode === "REQUIRED"
                    ? tr("production.stepExecution.lotSlipCodeRequired")
                    : tr("production.stepExecution.lotSlipCodeOptional")
                }
                value={lotText}
                withAsterisk={step.lotInputMode === "REQUIRED"}
              />
            )}
            <Group justify="center">
              <Button
                color="blue"
                disabled={
                  step.lotInputMode === "REQUIRED" && lotText.trim() === ""
                }
                leftSection={<IconPlayerPlay size={16} />}
                loading={isPending}
                onClick={handleStart}
              >
                {tr("production.stepExecution.start")}
              </Button>
            </Group>
          </Stack>
        ) : (
          <Alert
            color="yellow"
            title={tr("production.stepExecution.cannotStart")}
            variant="light"
          >
            <List size="sm">
              {data.canStart.reasons.map((r) => (
                <List.Item key={r}>{r}</List.Item>
              ))}
            </List>
          </Alert>
        ))}

      {/* ── IN_PROGRESS: 数量・不良入力（NONE は記録なしで完了） ── */}
      {step.status === "IN_PROGRESS" &&
        (step.quantityTracking === "NONE" ? (
          <Paper p="md" radius="md" withBorder>
            <Stack align="center" gap="md">
              <Text size="sm">
                この工程は数量記録なしで完了します（通過数{" "}
                {step.inputQuantity ?? data.expectedInputQuantity ?? "—"}）
              </Text>
              <Button
                color="green"
                disabled={!canOperate}
                leftSection={<IconCheck size={16} />}
                loading={isPending}
                onClick={handleCompleteWithoutQuantities}
              >
                {tr("common.complete")}
              </Button>
            </Stack>
          </Paper>
        ) : (
          <StepQuantityForm
            defectTypeOptions={data.defectTypeOptions}
            disabled={!canOperate}
            inputQuantity={step.inputQuantity ?? data.expectedInputQuantity}
            mode={step.quantityTracking}
            stepId={step.id}
            workOrderNumber={workOrderNumber}
          />
        ))}

      {/* ── COMPLETED: 数量サマリ（読み取り専用） ── */}
      {step.status === "COMPLETED" &&
        (step.quantityTracking === "NONE" ? (
          <Paper p="md" radius="md" withBorder>
            <Stack gap="md">
              <Title order={5}>
                {tr("production.stepExecution.quantityNotRecordedPassThrough")}
              </Title>
              <FieldValue
                label={tr("production.stepExecution.passedQuantity")}
                value={step.inputQuantity}
              />
            </Stack>
          </Paper>
        ) : (
          <Paper p="md" radius="md" withBorder>
            <Stack gap="md">
              <Title order={4}>
                {step.quantityTracking === "INSPECTION"
                  ? tr(
                      "production.stepExecution.inspectedCountAndResultRecorded",
                    )
                  : tr("production.stepExecution.quantityAndDefectsRecorded")}
              </Title>
              <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="md">
                <FieldValue
                  label={qtyLabels.input}
                  value={step.inputQuantity}
                />
                <FieldValue
                  label={qtyLabels.success}
                  value={step.outputSuccessQuantity}
                />
                <FieldValue
                  label={qtyLabels.semi}
                  value={step.outputDefectSemiFinished}
                />
                <FieldValue
                  label={qtyLabels.scrap}
                  value={step.outputDefectScrap}
                />
                <FieldValue
                  label={qtyLabels.rework}
                  value={step.outputDefectRework}
                />
              </SimpleGrid>
              {step.defectReasons.length > 0 && (
                <Stack gap="xs">
                  <Text c="dimmed" fw={600} size="sm">
                    {tr(
                      "production.stepExecution.defectBreakdownTypeReasonCount",
                    )}
                  </Text>
                  {step.defectReasons.map((r, i) => (
                    <Group
                      gap="sm"
                      // biome-ignore lint/suspicious/noArrayIndexKey: 読み取り専用の内訳
                      key={i}
                      wrap="wrap"
                    >
                      <Badge
                        color={
                          r.type === "SEMI"
                            ? "orange"
                            : r.type === "SCRAP"
                              ? "red"
                              : "yellow"
                        }
                        variant="light"
                      >
                        {r.type === "SEMI"
                          ? qtyLabels.semi
                          : r.type === "SCRAP"
                            ? qtyLabels.scrap
                            : qtyLabels.rework}
                      </Badge>
                      <Text size="sm">
                        {[
                          r.defectTypeId != null
                            ? (data.defectTypeOptions.find(
                                (o) => o.value === String(r.defectTypeId),
                              )?.label ?? `#${r.defectTypeId}`)
                            : null,
                          r.reason || null,
                        ]
                          .filter(Boolean)
                          .join(" / ") || "—"}
                      </Text>
                      <Text fw={600} size="sm">
                        {r.count}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              )}
            </Stack>
          </Paper>
        ))}

      {/* ── CANCELLED ── */}
      {step.status === "CANCELLED" && (
        <Alert
          color="red"
          title={tr("production.stepExecution.thisStepHasBeenCancelled")}
          variant="light"
        >
          {step.cancelReason ??
            tr("production.stepExecution.thisStepHasBeenCancelled2")}
        </Alert>
      )}

      {/* ── 検査表割当（工程単位。ポップアップで見る/編集する — design.md §10.10） ── */}
      {step.isInspection && (
        <StepInspectionSheetModal
          assigned={data.templates.map((t) => ({
            id: t.id,
            code: t.code,
            name: t.name,
          }))}
          canEdit={
            data.workOrderStatus !== "CANCELLED" && step.status !== "CANCELLED"
          }
          options={data.templateOptions}
          stepId={step.id}
          stepName={step.name}
          workOrderNumber={workOrderNumber}
        />
      )}

      {/* ── 検査記録 / 検査承認 ── */}
      {step.isApprovalStep ? (
        <InspectionApprovalPanel
          canApprove={step.status === "IN_PROGRESS" && canOperate}
          records={data.workOrderRecords}
          stepId={step.id}
          workOrderNumber={workOrderNumber}
        />
      ) : (
        (data.templates.length > 0 || data.stepRecords.length > 0) &&
        (step.isInspection || data.stepRecords.length > 0) && (
          <InspectionRecordForm
            canRecord={step.status === "IN_PROGRESS" && canOperate}
            lotQuantity={
              step.inputQuantity ??
              data.expectedInputQuantity ??
              data.plannedQuantity
            }
            records={data.stepRecords}
            stepId={step.id}
            templates={data.templates}
            workOrderNumber={workOrderNumber}
          />
        )
      )}

      {/* ── 最終検査・出荷前確認（カタログの印が付いた工程だけ。
             記録は指示書 1 件に 1 行） ── */}
      {step.isFinalInspection && (
        <WorkOrderFinalInspectionPanel
          canRecord={
            canOperate &&
            (step.status === "IN_PROGRESS" || step.status === "COMPLETED")
          }
          finalInspection={data.finalInspection}
          workOrderNumber={workOrderNumber}
        />
      )}

      {/* ── 作業計画 / 実績（分割記録・担当者・日付/時刻） ── */}
      <StepPlanActualPanel
        actuals={data.actuals}
        canOperate={canOperate}
        expectedInputQuantity={step.inputQuantity ?? data.expectedInputQuantity}
        plans={data.plans}
        stepId={step.id}
        stepStatus={step.status}
        workLocationOptions={data.workLocationOptions}
        workOrderNumber={workOrderNumber}
      />

      {/* ── 不良記録（§12.6 任意記録） ── */}
      <DefectRecordForm
        canRecord={step.status === "IN_PROGRESS" && canOperate}
        defectTypeOptions={data.defectTypeOptions}
        records={data.defectRecords}
        stepId={step.id}
        workOrderNumber={workOrderNumber}
      />

      {/* ── 外注日程 ── */}
      {isOutsource && (
        <Paper p="md" radius="md" withBorder>
          <Stack gap="md">
            <Title order={5}>
              {tr("production.stepExecution.outsourcingSchedule")}
            </Title>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <DatePickerInput
                clearable
                disabled={!canOperate}
                label={tr("common.requestedDate")}
                leftSection={<IconCalendar size={16} />}
                onChange={setRequestedAt}
                placeholder={tr("common.pickADate")}
                value={requestedAt}
                valueFormat="YYYY/MM/DD"
              />
              <DatePickerInput
                clearable
                disabled={!canOperate}
                label={tr("common.expectedDate")}
                leftSection={<IconCalendar size={16} />}
                onChange={setExpectedAt}
                placeholder={tr("common.pickADate")}
                value={expectedAt}
                valueFormat="YYYY/MM/DD"
              />
              <DatePickerInput
                clearable
                disabled={!canOperate}
                label={tr("common.receivedDate")}
                leftSection={<IconCalendar size={16} />}
                onChange={setReceivedAt}
                placeholder={tr("common.pickADate")}
                value={receivedAt}
                valueFormat="YYYY/MM/DD"
              />
              <NumberInput
                allowNegative={false}
                disabled={!canOperate}
                label={tr("production.stepExecution.outsourcingCost")}
                min={0}
                onChange={(v) =>
                  setOutsourceCost(typeof v === "number" ? v : "")
                }
                prefix="¥"
                thousandSeparator=","
                value={outsourceCost}
              />
            </SimpleGrid>
            {canOperate && (
              <Group justify="flex-end">
                <PrimaryButton
                  loading={isPending}
                  onClick={handleSaveOutsourceDates}
                >
                  {tr("production.stepExecution.saveTheOutsourcingSchedule")}
                </PrimaryButton>
              </Group>
            )}
          </Stack>
        </Paper>
      )}

      {/* ── 中断 / 巻き戻し ── */}
      {step.status === "IN_PROGRESS" && canOperate && (
        <Group justify="center" mt="md">
          <Button
            color="red"
            onClick={() => setReasonMode("abort")}
            variant="outline"
          >
            {tr("production.stepExecution.interruptRollBack")}
          </Button>
        </Group>
      )}
      {step.status === "COMPLETED" && woExecutable && (
        <Group justify="center" mt="md">
          <Button
            color="orange"
            leftSection={<IconArrowBackUp size={16} />}
            onClick={() => setReasonMode("rollback")}
            variant="outline"
          >
            {tr("production.stepExecution.rollBack")}
          </Button>
        </Group>
      )}

      {/* ── 理由入力モーダル ── */}
      <ModalShell
        confirmColor={reasonMode === "abort" ? "red" : "orange"}
        confirmLabel={
          reasonMode === "abort"
            ? tr("production.stepExecutionView.abort")
            : tr("production.stepExecution.rollBack2")
        }
        loading={isPending}
        onClose={() => setReasonMode(null)}
        onConfirm={handleReasonConfirm}
        opened={reasonMode != null}
        size="md"
        title={
          reasonMode === "abort"
            ? tr("production.stepExecution.interruptTheStepRollBack")
            : tr("production.stepExecution.rollBackACompletedStep")
        }
      >
        <Stack gap="sm">
          <Text size="sm">
            {reasonMode === "abort"
              ? tr("production.stepExecution.returnsAnInProgressStepTo")
              : tr("production.stepExecution.returnsACompletedStepToNot")}
          </Text>
          <Textarea
            autosize
            label={tr("common.reason")}
            minRows={3}
            onChange={(e) => setReason(e.currentTarget.value)}
            value={reason}
            withAsterisk
          />
        </Stack>
      </ModalShell>
    </Stack>
  );
}
