"use client";

/**
 * StepPlanActualPanel — 工程の作業計画 / 実績 (§7 分割記録)。
 *
 * 1 工程に複数行の計画・実績を記録できる（担当者ごと・日付ごとの分割）。
 * 計画の必須項目は工程マスタが決め（lib/work-plan-core.ts requiredPlanFields）、
 * 画面は**赤い必須印だけ**で示す —「（任意）」と書き添えない。印の無い欄が任意。
 * 実績は起きたことの記録なので必須は 担当者・日付 だけ。
 * 担当者は従業員検索（searchUserOptions）。計画は未完了の工程で、実績は
 * 進行中の工程で編集できる。
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
import { useTranslations } from "next-intl";
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
import type { PlanField } from "@/lib/work-plan-core";

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
  const tr = useTranslations();
  const fmt = useFormat();
  if (rows.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        {tr("production.stepPlanActualPanel.thereAreNoRecords")}
      </Text>
    );
  }
  return (
    <Table striped withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{tr("common.assignee")}</Table.Th>
          <Table.Th w={120}>{tr("common.date")}</Table.Th>
          <Table.Th w={130}>
            {tr("production.stepPlanActualPanel.hours")}
          </Table.Th>
          <Table.Th ta="right" w={90}>
            {tr("common.quantity")}
          </Table.Th>
          {showLocation && (
            <Table.Th w={180}>
              {tr("production.stepPlanActualPanel.workLocation")}
            </Table.Th>
          )}
          <Table.Th>{tr("common.notes")}</Table.Th>
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
                  {r.startTime
                    ? `${r.startTime}〜${r.endTime ?? ""}`
                    : tr("production.stepPlanActualPanel.allDay")}
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
                  aria-label={tr(
                    "production.stepPlanActualPanel.deleteThisRecord",
                  )}
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
  requiredPlanFields = [],
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
  /**
   * 計画で必須の項目（工程マスタの印 × 社内工程 — lib/work-plan-core.ts
   * requiredPlanFields）。実績には効かない（実績は起きたことの記録）。
   */
  requiredPlanFields?: readonly PlanField[];
}) {
  const tr = useTranslations();
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
  // 必須印と入力チェックは同じ集合を見る — 承認依頼のゲートと同じ相手。
  const req = (f: PlanField) =>
    kind === "plan" && requiredPlanFields.includes(f);
  const locationRequired = req("WORK_LOCATION") && showLocation;
  const timeRequired = req("TIME");
  const quantityRequired = req("QUANTITY");

  const handleAdd = () => {
    if (!userId) {
      notifications.show({
        title: tr("common.missingInput"),
        message: tr("production.stepPlanActualPanel.selectAnAssignee"),
        color: "red",
      });
      return;
    }
    if (!date) {
      notifications.show({
        title: tr("common.missingInput"),
        message: tr("production.stepPlanActualPanel.selectADate"),
        color: "red",
      });
      return;
    }
    // 作業計画は作業場所も必須（§7 — 承認前に「どこで」まで決める）。実績は
    // 従来どおり任意。作業場所が 1 つも登録されていない環境では選びようが
    // 無いので要求しない（サーバー側 addStepPlan と同じ）。
    if (locationRequired && !workLocationId) {
      notifications.show({
        title: tr("common.missingInput"),
        message: tr("production.stepPlanActualPanel.selectAWorkLocation"),
        color: "red",
      });
      return;
    }
    if (timeRequired && (!startTime || !endTime)) {
      notifications.show({
        title: tr("common.missingInput"),
        message: tr("production.stepPlanActualPanel.enterStartAndEnd"),
        color: "red",
      });
      return;
    }
    if (quantityRequired && quantity === "") {
      notifications.show({
        title: tr("common.missingInput"),
        message: tr("production.stepPlanActualPanel.enterQuantity"),
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
          title: tr("common.added"),
          message:
            kind === "plan"
              ? tr("production.stepPlanActualPanel.theWorkPlanWasAdded")
              : tr("production.stepPlanActualPanel.theWorkActualsWereAdded"),
          color: "green",
        });
        setStartTime("");
        setEndTime("");
        setQuantity("");
        setNotes("");
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message:
            result.errors?.join(" / ") ??
            tr("production.stepPlanActualPanel.couldNotAdd"),
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
          title: tr("common.error2"),
          message: result.errors?.join(" / ") ?? tr("common.couldNotDelete"),
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
                  label={tr("common.assignee")}
                  onChange={setUserId}
                  onSearch={searchUserOptions}
                  placeholder={tr(
                    "production.stepPlanActualPanel.searchEmployees",
                  )}
                  required
                  storageKey={`step-${kind}-user`}
                  value={userId}
                />
              </div>
              <DatePickerInput
                label={tr("common.date")}
                leftSection={<IconCalendar size={16} />}
                onChange={setDate}
                placeholder={tr("common.date")}
                value={date}
                valueFormat="YYYY/MM/DD"
                w={150}
                withAsterisk
              />
              <TimeInput
                label={tr("production.stepPlanActualPanel.start")}
                onChange={(e) => setStartTime(e.currentTarget.value)}
                value={startTime}
                w={110}
                withAsterisk={timeRequired}
              />
              <TimeInput
                label={tr("production.stepPlanActualPanel.end")}
                onChange={(e) => setEndTime(e.currentTarget.value)}
                value={endTime}
                w={110}
                withAsterisk={timeRequired}
              />
              <NumberInput
                allowNegative={false}
                label={tr("common.quantity")}
                min={1}
                onChange={(v) => setQuantity(typeof v === "number" ? v : "")}
                placeholder={
                  suggestedQuantity != null
                    ? String(suggestedQuantity)
                    : undefined
                }
                value={quantity}
                w={120}
                withAsterisk={quantityRequired}
              />
              {showLocation && (
                <Select
                  clearable={!locationRequired}
                  data={workLocationOptions}
                  label={tr("production.stepPlanActualPanel.workLocation")}
                  onChange={setWorkLocationId}
                  placeholder={tr("production.stepPlanActualPanel.machineArea")}
                  searchable
                  value={workLocationId}
                  w={220}
                  withAsterisk={locationRequired}
                />
              )}
              <TextInput
                label={tr("common.notes")}
                onChange={(e) => setNotes(e.currentTarget.value)}
                style={{ flex: 1, minWidth: 140 }}
                value={notes}
              />
              <PrimaryButton
                leftSection={<IconPlus size={14} />}
                loading={isPending}
                onClick={handleAdd}
              >
                {tr("common.add")}
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
  canEditPlans,
  plans,
  actuals,
  expectedInputQuantity,
  workLocationOptions,
  requiredPlanFields = [],
}: {
  workOrderNumber: number;
  stepId: string;
  stepStatus: string;
  /** 指示書が実行可能 & 他ユーザーのロックなし（実績の追加・削除）。 */
  canOperate: boolean;
  /**
   * 計画の追加・削除ができるか。下書きの指示書でも true — 作業計画は承認依頼の
   * 条件なので、承認前に入れられなければならない。省略時は canOperate。
   */
  canEditPlans?: boolean;
  plans: StepPlanView[];
  actuals: StepActualView[];
  expectedInputQuantity: number | null;
  /** 作業場所の選択肢（計画・実績フォーム用）。 */
  workLocationOptions: { value: string; label: string }[];
  /** 計画で必須の項目（工程マスタの印 × 社内工程）。 */
  requiredPlanFields?: readonly PlanField[];
}) {
  const tr = useTranslations();
  const planEditable =
    (canEditPlans ?? canOperate) &&
    (stepStatus === "PENDING" || stepStatus === "IN_PROGRESS");
  const actualEditable = canOperate && stepStatus === "IN_PROGRESS";

  return (
    <>
      <RecordSection
        canEdit={planEditable}
        description={tr("production.stepPlanActualPanel.youCanSplitThePlanBy")}
        kind="plan"
        requiredPlanFields={requiredPlanFields}
        rows={plans}
        stepId={stepId}
        suggestedQuantity={expectedInputQuantity}
        title={tr("production.stepPlanActualPanel.workPlan")}
        workLocationOptions={workLocationOptions}
        workOrderNumber={workOrderNumber}
      />
      <RecordSection
        canEdit={actualEditable}
        description={tr(
          "production.stepPlanActualPanel.recordsTheWorkDonePerAssignee",
        )}
        kind="actual"
        rows={actuals}
        stepId={stepId}
        suggestedQuantity={expectedInputQuantity}
        title={tr("production.stepPlanActualPanel.workActuals")}
        workLocationOptions={workLocationOptions}
        workOrderNumber={workOrderNumber}
      />
    </>
  );
}
