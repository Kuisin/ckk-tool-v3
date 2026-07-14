"use client";

/**
 * StepExecutionView — 工程実行画面 (design.md §12.3 / §20.1)。
 *
 * タブレット最優先: すべての操作要素は size="lg"（44px タッチターゲット）。
 * 構成: 工程アイデンティティ Paper → セッションロック Alert →
 * [PENDING] 開始可否 + 工程開始 → [IN_PROGRESS] 数量入力 + 検査記録 +
 * 不良記録 + 中断（巻き戻し）→ [COMPLETED] 数量サマリ + 巻き戻し。
 * 外注工程は 依頼日 / 入荷予定日 / 入荷日 を編集できる。
 */

import {
  Alert,
  Badge,
  Button,
  Group,
  List,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import {
  IconArrowBackUp,
  IconCalendar,
  IconLock,
  IconPlayerPlay,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  abortStep,
  rollbackStep,
  saveOutsourceDates,
  startStep,
} from "@/app/(dashboard)/production/work-orders/[id]/steps/[stepId]/actions";
import { DefectRecordForm } from "@/components/production/DefectRecordForm";
import {
  InspectionApprovalPanel,
  InspectionRecordForm,
} from "@/components/production/InspectionRecordForm";
import { StepQuantityForm } from "@/components/production/StepQuantityForm";
import { PrimaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { ModalShell } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/format";
import type { StepExecutionData } from "./model";

const BASE_PATH = "/production/work-orders";

export function StepExecutionView({ data }: { data: StepExecutionData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { step, workOrderNumber } = data;

  // 中断 / 巻き戻し 理由モーダル
  const [reasonMode, setReasonMode] = useState<"abort" | "rollback" | null>(
    null,
  );
  const [reason, setReason] = useState("");

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

  const isOutsource = step.executionLocation === "OUTSOURCE";
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
        message: `工程: ${step.name}`,
        color: "green",
      });
      router.refresh();
    } else {
      notifications.show({
        title: "エラー",
        message: result.errors?.join(" / ") ?? fallback,
        color: "red",
      });
    }
  };

  const handleStart = () => {
    startTransition(async () => {
      const result = await startStep(workOrderNumber, step.id);
      notifyResult(result, "工程を開始しました", "工程の開始に失敗しました");
    });
  };

  const handleReasonConfirm = () => {
    if (!reason.trim()) {
      notifications.show({
        title: "入力不足",
        message: "理由を入力してください",
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
        mode === "abort" ? "工程を中断しました" : "工程を巻き戻しました",
        "操作に失敗しました",
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
      });
      notifyResult(
        result,
        "外注日程を保存しました",
        "外注日程の保存に失敗しました",
      );
    });
  };

  return (
    <Stack gap="md">
      {/* ── 工程アイデンティティ ── */}
      <Paper p="lg" radius="md" withBorder>
        <Stack gap="xs">
          <Group justify="space-between" wrap="wrap">
            <Group gap="sm" wrap="wrap">
              <Title order={3}>{step.name}</Title>
              <StatusBadge entity="Step" size="lg" status={step.status} />
              <Badge
                color={isOutsource ? "orange" : "gray"}
                size="sm"
                variant="outline"
              >
                {isOutsource ? "外注" : "社内"}
              </Badge>
              {step.isInspection && (
                <Badge color="blue" size="sm" variant="light">
                  検査
                </Badge>
              )}
              {step.isApprovalStep && (
                <Badge color="teal" size="sm" variant="light">
                  検査承認
                </Badge>
              )}
            </Group>
            <Link href={`${BASE_PATH}/${workOrderNumber}`}>
              <DocNumber c="blue">指示書 #{workOrderNumber}</DocNumber>
            </Link>
          </Group>
          <Group gap="xl" wrap="wrap">
            <Text c="dimmed" size="sm">
              実施先:{" "}
              {(isOutsource ? step.supplierName : step.factoryName) ?? "—"}
            </Text>
            <Text c="dimmed" size="sm">
              予定数量: {data.plannedQuantity}
            </Text>
            {step.startedAt && (
              <Text c="dimmed" size="sm">
                開始: {formatDateTime(step.startedAt)}
                {step.startedByName ? `（${step.startedByName}）` : ""}
              </Text>
            )}
            {step.completedAt && (
              <Text c="dimmed" size="sm">
                完了: {formatDateTime(step.completedAt)}
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
          title="別のユーザーがセッション中です"
          variant="filled"
        >
          {step.sessionLockedByName ?? "別のユーザー"}
          がこの工程を操作しています。完了または中断されるまで操作できません。
        </Alert>
      )}

      {/* ── PENDING: 開始可否・工程開始 ── */}
      {step.status === "PENDING" &&
        (!woExecutable ? (
          <Alert color="yellow" title="開始できません" variant="light">
            指示書が承認済み / 進行中ではないため、工程を開始できません。
          </Alert>
        ) : data.canStart.ok && !lockedByOther ? (
          <Group justify="center" mt="md">
            <Button
              color="blue"
              leftSection={<IconPlayerPlay size={20} />}
              loading={isPending}
              onClick={handleStart}
              size="lg"
            >
              工程開始
            </Button>
          </Group>
        ) : (
          <Alert color="yellow" title="開始できません" variant="light">
            <List size="sm">
              {data.canStart.reasons.map((r) => (
                <List.Item key={r}>{r}</List.Item>
              ))}
            </List>
          </Alert>
        ))}

      {/* ── IN_PROGRESS: 数量・不良入力 ── */}
      {step.status === "IN_PROGRESS" && (
        <StepQuantityForm
          defaultInputQuantity={
            step.inputQuantity ?? data.expectedInputQuantity
          }
          disabled={!canOperate}
          stepId={step.id}
          workOrderNumber={workOrderNumber}
        />
      )}

      {/* ── COMPLETED: 数量サマリ（読み取り専用） ── */}
      {step.status === "COMPLETED" && (
        <Paper p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Title order={4}>数量・不良（記録済み）</Title>
            <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="md">
              <FieldValue label="受入数" value={step.inputQuantity} />
              <FieldValue label="良品数" value={step.outputSuccessQuantity} />
              <FieldValue
                label="半製品"
                value={step.outputDefectSemiFinished}
              />
              <FieldValue label="廃棄" value={step.outputDefectScrap} />
              <FieldValue label="手直し" value={step.outputDefectRework} />
            </SimpleGrid>
          </Stack>
        </Paper>
      )}

      {/* ── CANCELLED ── */}
      {step.status === "CANCELLED" && (
        <Alert color="red" title="キャンセル済みの工程です" variant="light">
          {step.cancelReason ?? "この工程はキャンセルされています。"}
        </Alert>
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
            records={data.stepRecords}
            stepId={step.id}
            templates={data.templates}
            workOrderNumber={workOrderNumber}
          />
        )
      )}

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
        <Paper p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Title order={4}>外注日程</Title>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <DatePickerInput
                clearable
                disabled={!canOperate}
                label="依頼日"
                leftSection={<IconCalendar size={16} />}
                onChange={setRequestedAt}
                placeholder="日付を選択"
                size="lg"
                value={requestedAt}
                valueFormat="YYYY/MM/DD"
              />
              <DatePickerInput
                clearable
                disabled={!canOperate}
                label="入荷予定日"
                leftSection={<IconCalendar size={16} />}
                onChange={setExpectedAt}
                placeholder="日付を選択"
                size="lg"
                value={expectedAt}
                valueFormat="YYYY/MM/DD"
              />
              <DatePickerInput
                clearable
                disabled={!canOperate}
                label="入荷日"
                leftSection={<IconCalendar size={16} />}
                onChange={setReceivedAt}
                placeholder="日付を選択"
                size="lg"
                value={receivedAt}
                valueFormat="YYYY/MM/DD"
              />
            </SimpleGrid>
            {canOperate && (
              <Group justify="flex-end">
                <PrimaryButton
                  loading={isPending}
                  onClick={handleSaveOutsourceDates}
                  size="lg"
                >
                  外注日程を保存
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
            size="lg"
            variant="outline"
          >
            中断（巻き戻し）
          </Button>
        </Group>
      )}
      {step.status === "COMPLETED" && woExecutable && (
        <Group justify="center" mt="md">
          <Button
            color="orange"
            leftSection={<IconArrowBackUp size={20} />}
            onClick={() => setReasonMode("rollback")}
            size="lg"
            variant="outline"
          >
            巻き戻し
          </Button>
        </Group>
      )}

      {/* ── 理由入力モーダル ── */}
      <ModalShell
        confirmColor={reasonMode === "abort" ? "red" : "orange"}
        confirmLabel={reasonMode === "abort" ? "中断する" : "巻き戻す"}
        loading={isPending}
        onClose={() => setReasonMode(null)}
        onConfirm={handleReasonConfirm}
        opened={reasonMode != null}
        size="md"
        title={
          reasonMode === "abort"
            ? "工程の中断（巻き戻し）"
            : "完了工程の巻き戻し"
        }
      >
        <Stack gap="sm">
          <Text size="sm">
            {reasonMode === "abort"
              ? "進行中の工程を未着手へ戻します。入力中の数量は保存されません。"
              : "完了済みの工程を未着手へ戻し、記録済みの数量をクリアします。後続工程が着手済みの場合は巻き戻せません。"}
          </Text>
          <Textarea
            autosize
            label="理由"
            minRows={3}
            onChange={(e) => setReason(e.currentTarget.value)}
            size="lg"
            value={reason}
            withAsterisk
          />
        </Stack>
      </ModalShell>
    </Stack>
  );
}
