"use client";

/**
 * StepPlanActualPanel — 工程の作業計画 / 実績 (§7 分割記録)。
 *
 * 1 工程に複数行の計画・実績を記録できる（担当者ごと・日付ごとの分割）。
 * 計画は日付のみ or 開始/終了時刻付き。実績も同形。担当者は従業員検索
 * （searchUserOptions）。計画は未完了の工程で、実績は進行中の工程で編集できる。
 */

import {
  ActionIcon,
  Badge,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { DatePickerInput, TimeInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconCalendar, IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { searchUserOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  addStepActual,
  addStepPlan,
  deleteStepActual,
  deleteStepPlan,
  type StepPlanInput,
} from "@/app/(dashboard)/production/work-orders/[id]/steps/[stepId]/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import type {
  StepActualView,
  StepPlanView,
} from "@/components/production/step-execution/model";
import { PrimaryButton } from "@/components/ui/buttons";
import { SearchSelect } from "@/components/ui/SearchSelect";

function RecordTable({
  rows,
  canEdit,
  onDelete,
  deleting,
  showLocation,
}: {
  rows: (StepPlanView | StepActualView)[];
  canEdit: boolean;
  onDelete: (id: string) => void;
  deleting: boolean;
  /** 作業場所列。 */
  showLocation?: boolean;
}) {
  const fmt = useFormat();
  if (rows.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        記録はありません
      </Text>
    );
  }
  return (
    <Table striped withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>担当者</Table.Th>
          <Table.Th w={120}>日付</Table.Th>
          <Table.Th w={130}>時間</Table.Th>
          <Table.Th ta="right" w={90}>
            数量
          </Table.Th>
          {showLocation && <Table.Th w={180}>作業場所</Table.Th>}
          <Table.Th>備考</Table.Th>
          {canEdit && <Table.Th w={50} />}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((r) => (
          <Table.Tr key={r.id}>
            <Table.Td>
              <Text size="sm">{r.userName}</Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{fmt.date(r.date)}</Text>
            </Table.Td>
            <Table.Td>
              <Group gap={6} wrap="nowrap">
                <Text size="sm">
                  {r.startTime ? `${r.startTime}〜${r.endTime ?? ""}` : "終日"}
                </Text>
                {(r.concurrentCount ?? 1) > 1 && (
                  <Badge color="grape" size="xs" variant="light">
                    同時 {r.concurrentCount}
                  </Badge>
                )}
              </Group>
            </Table.Td>
            <Table.Td ta="right">
              <Text className="tabular-nums" size="sm">
                {r.quantity ?? "—"}
              </Text>
            </Table.Td>
            {showLocation && (
              <Table.Td>
                <Text c="dimmed" size="sm" truncate>
                  {r.workLocationName ?? "—"}
                </Text>
              </Table.Td>
            )}
            <Table.Td>
              <Text c="dimmed" size="sm">
                {r.notes ?? ""}
              </Text>
            </Table.Td>
            {canEdit && (
              <Table.Td>
                <ActionIcon
                  aria-label="この記録を削除"
                  color="red"
                  disabled={deleting}
                  onClick={() => onDelete(r.id)}
                  variant="subtle"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Table.Td>
            )}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function RecordSection({
  kind,
  title,
  description,
  rows,
  canEdit,
  workOrderNumber,
  stepId,
  suggestedQuantity,
  workLocationOptions = [],
}: {
  kind: "plan" | "actual";
  title: string;
  description: string;
  rows: (StepPlanView | StepActualView)[];
  canEdit: boolean;
  workOrderNumber: number;
  stepId: string;
  /** 数量の目安（残数などは設けず参考表示のみ）。 */
  suggestedQuantity: number | null;
  /** 作業場所の選択肢。 */
  workLocationOptions?: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [userId, setUserId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [quantity, setQuantity] = useState<number | "">("");
  const [workLocationId, setWorkLocationId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const showLocation = workLocationOptions.length > 0;

  const handleAdd = () => {
    if (!userId) {
      notifications.show({
        title: "入力不足",
        message: "担当者を選択してください",
        color: "red",
      });
      return;
    }
    if (!date) {
      notifications.show({
        title: "入力不足",
        message: "日付を選択してください",
        color: "red",
      });
      return;
    }
    const payload: StepPlanInput = {
      workOrderNumber,
      stepId,
      userId,
      date,
      startTime: startTime || null,
      endTime: endTime || null,
      quantity: quantity === "" ? null : quantity,
      workLocationId: workLocationId ? Number(workLocationId) : null,
      notes,
    };
    startTransition(async () => {
      const result =
        kind === "plan"
          ? await addStepPlan(payload)
          : await addStepActual(payload);
      if (result.ok) {
        notifications.show({
          title: "追加しました",
          message:
            kind === "plan"
              ? "作業計画を追加しました"
              : "作業実績を追加しました",
          color: "green",
        });
        setStartTime("");
        setEndTime("");
        setQuantity("");
        setNotes("");
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.errors?.join(" / ") ?? "追加に失敗しました",
          color: "red",
        });
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result =
        kind === "plan"
          ? await deleteStepPlan(workOrderNumber, stepId, id)
          : await deleteStepActual(workOrderNumber, stepId, id);
      if (result.ok) {
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.errors?.join(" / ") ?? "削除に失敗しました",
          color: "red",
        });
      }
    });
  };

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="md">
        <Stack gap={2}>
          <Title order={4}>{title}</Title>
          <Text c="dimmed" size="xs">
            {description}
          </Text>
        </Stack>
        <RecordTable
          canEdit={canEdit}
          deleting={isPending}
          onDelete={handleDelete}
          rows={rows}
          showLocation={
            showLocation || rows.some((r) => r.workLocationName != null)
          }
        />
        {canEdit && (
          <Stack gap="xs">
            <Group align="flex-end" gap="xs" wrap="wrap">
              <div style={{ flex: 2, minWidth: 200 }}>
                <SearchSelect
                  label="担当者"
                  onChange={setUserId}
                  onSearch={searchUserOptions}
                  placeholder="従業員を検索"
                  storageKey={`step-${kind}-user`}
                  value={userId}
                />
              </div>
              <DatePickerInput
                label="日付"
                leftSection={<IconCalendar size={16} />}
                onChange={setDate}
                placeholder="日付"
                value={date}
                valueFormat="YYYY/MM/DD"
                w={150}
              />
              <TimeInput
                label="開始（任意）"
                onChange={(e) => setStartTime(e.currentTarget.value)}
                value={startTime}
                w={110}
              />
              <TimeInput
                label="終了（任意）"
                onChange={(e) => setEndTime(e.currentTarget.value)}
                value={endTime}
                w={110}
              />
              <NumberInput
                allowNegative={false}
                label="数量（任意）"
                min={1}
                onChange={(v) => setQuantity(typeof v === "number" ? v : "")}
                placeholder={
                  suggestedQuantity != null
                    ? String(suggestedQuantity)
                    : undefined
                }
                value={quantity}
                w={120}
              />
              {showLocation && (
                <Select
                  clearable
                  data={workLocationOptions}
                  label="作業場所（任意）"
                  onChange={setWorkLocationId}
                  placeholder="機械・エリア"
                  searchable
                  value={workLocationId}
                  w={220}
                />
              )}
              <TextInput
                label="備考"
                onChange={(e) => setNotes(e.currentTarget.value)}
                style={{ flex: 1, minWidth: 140 }}
                value={notes}
              />
              <PrimaryButton
                leftSection={<IconPlus size={14} />}
                loading={isPending}
                onClick={handleAdd}
              >
                追加
              </PrimaryButton>
            </Group>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

export function StepPlanActualPanel({
  workOrderNumber,
  stepId,
  stepStatus,
  canOperate,
  plans,
  actuals,
  expectedInputQuantity,
  workLocationOptions,
}: {
  workOrderNumber: number;
  stepId: string;
  stepStatus: string;
  /** 指示書が実行可能 & 他ユーザーのロックなし。 */
  canOperate: boolean;
  plans: StepPlanView[];
  actuals: StepActualView[];
  expectedInputQuantity: number | null;
  /** 作業場所の選択肢（計画・実績フォーム用）。 */
  workLocationOptions: { value: string; label: string }[];
}) {
  const planEditable =
    canOperate && (stepStatus === "PENDING" || stepStatus === "IN_PROGRESS");
  const actualEditable = canOperate && stepStatus === "IN_PROGRESS";

  return (
    <>
      <RecordSection
        canEdit={planEditable}
        description="担当者・日付（または時刻）ごとに分割して計画できます。作業場所（機械・エリア）も任意で割り当てられます。"
        kind="plan"
        rows={plans}
        stepId={stepId}
        suggestedQuantity={expectedInputQuantity}
        title="作業計画"
        workLocationOptions={workLocationOptions}
        workOrderNumber={workOrderNumber}
      />
      <RecordSection
        canEdit={actualEditable}
        description="実施した作業を担当者・日付ごとに記録します（進行中のみ追加可）。共有端末からの実績には端末の既定作業場所が入ります。"
        kind="actual"
        rows={actuals}
        stepId={stepId}
        suggestedQuantity={expectedInputQuantity}
        title="作業実績"
        workLocationOptions={workLocationOptions}
        workOrderNumber={workOrderNumber}
      />
    </>
  );
}
