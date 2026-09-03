"use client";

/**
 * StepQuantityForm — 工程の数量・不良入力 (design.md §12.3)。
 *
 * 受入数は開始時に確定した値で**固定表示**（完了時は編集不可）。不良は
 * **1 本のリスト**で入力し、各行に 種別（半製品/廃棄/工程分岐）・不良種類
 * （マスタ FK・必須）・詳細（必須）・数 を持つ。区分ごとの合計はこのリストの
 * 合計として導出し、良品数 = 受入 − 総不良も自動計算する（キオスクと同一
 * モデル）。在庫連携は区分合計をそのまま使うので不変。「工程完了」で
 * completeStep アクションを呼ぶ（サーバー側でも再検証）。
 */

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCheck,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { completeStep } from "@/app/(dashboard)/production/work-orders/[id]/steps/[stepId]/actions";
import type { SelectOption } from "@/components/production/step-execution/model";
import {
  checkDefectList,
  cleanReasonEntries,
  type DefectDisposition,
  type DefectReasonEntry,
  defectListTotal,
  deriveSuccessFromList,
  dispositionTotals,
  quantitiesFromList,
} from "@/lib/step-defects";
import type { QuantityTrackingMode } from "@/lib/workflow-core";
import { localizedQuantityLabels } from "@/lib/workflow-core-labels";

export function StepQuantityForm({
  workOrderNumber,
  stepId,
  inputQuantity,
  defectTypeOptions,
  disabled,
  mode = "FLOW",
}: {
  workOrderNumber: number;
  stepId: string;
  /** 受入数（開始時に確定した値。完了時は編集不可）。 */
  inputQuantity: number | null;
  /** 不良種類（理由の候補）。 */
  defectTypeOptions: SelectOption[];
  disabled?: boolean;
  mode?: QuantityTrackingMode;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [defects, setDefects] = useState<DefectReasonEntry[]>([]);

  const input = inputQuantity ?? 0;
  const labels = localizedQuantityLabels(tr, mode);
  const issue = checkDefectList(defects, input, mode);
  const total = defectListTotal(defects);
  const success = deriveSuccessFromList(input, defects);
  const totals = dispositionTotals(defects);

  // 不良種類はマスタ FK（value = defect_types.id の文字列）で保持・保存する。
  const typeData = defectTypeOptions.map((o) => ({
    value: o.value,
    label: o.label,
  }));

  const setRow = (index: number, patch: Partial<DefectReasonEntry>) =>
    setDefects((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );

  const handleComplete = () => {
    startTransition(async () => {
      const result = await completeStep(
        workOrderNumber,
        stepId,
        quantitiesFromList(input, defects),
        cleanReasonEntries(defects),
      );
      if (result.ok) {
        notifications.show({
          title: tr("common.stepCompleted"),
          message: `${labels.success} ${success} / ${labels.input} ${input}`,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message:
            result.errors?.join(" / ") ?? tr("common.couldNotCompleteTheStep"),
          color: "red",
        });
      }
    });
  };

  return (
    <Paper p="lg" radius="md" withBorder>
      <Stack gap="md">
        <Title order={4}>
          {mode === "INSPECTION"
            ? tr("production.stepQuantityForm.inspectedCountAndResult")
            : tr("production.stepQuantityForm.quantityAndDefects")}
        </Title>

        {/* 受入（固定）+ 良品（自動計算）+ 総不良 */}
        <SimpleGrid cols={{ base: 3 }} spacing="md">
          <Paper p="sm" radius="sm" withBorder>
            <Text c="dimmed" size="xs">
              {labels.input}
            </Text>
            <Text fw={700} size="xl">
              {input}
            </Text>
            <Badge color="gray" mt={4} size="xs" variant="light">
              {tr("production.stepQuantityForm.fixed")}
            </Badge>
          </Paper>
          <Paper p="sm" radius="sm" withBorder>
            <Text c="dimmed" size="xs">
              {labels.success}
            </Text>
            <Text c="green" fw={700} size="xl">
              {success}
            </Text>
            <Badge color="green" mt={4} size="xs" variant="light">
              {tr("common.auto")}
            </Badge>
          </Paper>
          <Paper p="sm" radius="sm" withBorder>
            <Text c="dimmed" size="xs">
              {tr("production.stepQuantityForm.totalDefects")}
            </Text>
            <Text c={total > 0 ? "orange" : undefined} fw={700} size="xl">
              {total}
            </Text>
          </Paper>
        </SimpleGrid>

        <Group justify="space-between">
          <Text c="dimmed" fw={600} size="sm">
            {tr("production.stepQuantityForm.defectBreakdown")}
          </Text>
          {total > 0 && (
            <Group gap="xs">
              {totals.semi > 0 && (
                <Badge color="orange" variant="light">
                  {labels.semi} {totals.semi}
                </Badge>
              )}
              {totals.scrap > 0 && (
                <Badge color="red" variant="light">
                  {labels.scrap} {totals.scrap}
                </Badge>
              )}
              {totals.rework > 0 && (
                <Badge color="yellow" variant="light">
                  {labels.rework} {totals.rework}
                </Badge>
              )}
            </Group>
          )}
        </Group>

        {defects.map((row, index) => (
          <Paper
            // biome-ignore lint/suspicious/noArrayIndexKey: 追記専用の行フォーム
            key={index}
            p="sm"
            radius="sm"
            withBorder
          >
            <Stack gap="xs">
              <Group align="flex-end" gap="sm" wrap="nowrap">
                <Select
                  aria-label={tr("common.type2")}
                  data={[
                    { value: "SEMI", label: labels.semi },
                    { value: "SCRAP", label: labels.scrap },
                    { value: "REWORK", label: labels.rework },
                  ]}
                  disabled={disabled}
                  label={tr("common.type2")}
                  onChange={(v) =>
                    v && setRow(index, { type: v as DefectDisposition })
                  }
                  style={{ width: 160, flexShrink: 0 }}
                  value={row.type}
                />
                <Select
                  aria-label={tr("common.defectType")}
                  data={typeData}
                  disabled={disabled}
                  label={tr("common.defectType")}
                  onChange={(v) =>
                    setRow(index, { defectTypeId: v ? Number(v) : null })
                  }
                  placeholder={tr(
                    "production.stepQuantityForm.selectADefectType",
                  )}
                  searchable
                  style={{ flex: 1 }}
                  value={
                    row.defectTypeId != null ? String(row.defectTypeId) : null
                  }
                  withAsterisk
                />
                <NumberInput
                  allowDecimal={false}
                  allowNegative={false}
                  aria-label={tr("production.stepQuantityForm.count")}
                  disabled={disabled}
                  label={tr("production.stepQuantityForm.count")}
                  min={1}
                  onChange={(v) =>
                    setRow(index, {
                      count: typeof v === "number" ? v : Number(v) || 1,
                    })
                  }
                  style={{ width: 120 }}
                  value={row.count}
                />
                <ActionIcon
                  aria-label={tr("common.delete")}
                  color="red"
                  disabled={disabled}
                  mb={4}
                  onClick={() =>
                    setDefects((prev) => prev.filter((_, i) => i !== index))
                  }
                  size={36}
                  variant="light"
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Group>
              <TextInput
                aria-label={tr("production.stepQuantityForm.detail")}
                disabled={disabled}
                label={tr("production.stepQuantityForm.detail")}
                maxLength={200}
                onChange={(e) =>
                  setRow(index, { reason: e.currentTarget.value })
                }
                placeholder={tr(
                  "production.stepQuantityForm.defectDetailRequired",
                )}
                value={row.reason}
                withAsterisk
              />
            </Stack>
          </Paper>
        ))}

        <Button
          disabled={disabled}
          leftSection={<IconPlus size={18} />}
          onClick={() =>
            setDefects((prev) => [
              ...prev,
              { type: "SCRAP", defectTypeId: null, reason: "", count: 1 },
            ])
          }
          variant="light"
        >
          {tr("production.stepQuantityForm.addDefect")}
        </Button>

        {issue && (
          <Alert
            color="orange"
            icon={<IconAlertTriangle size={16} />}
            variant="light"
          >
            {issue.kind === "NEGATIVE"
              ? tr("production.stepQuantityForm.quantitiesMustBeWholeNumbersOf")
              : issue.kind === "INCOMPLETE"
                ? tr("production.stepQuantityForm.enterADefectTypeAndDetail")
                : tr(
                    "production.stepQuantityForm.defectTotalWithSumExceedsInput",
                    { sum: issue.sum, input: issue.input },
                  )}
          </Alert>
        )}

        <Group justify="center" mt="sm">
          <Button
            color="green"
            disabled={disabled || issue != null}
            leftSection={<IconCheck size={20} />}
            loading={isPending}
            onClick={handleComplete}
            size="lg"
          >
            {tr("common.complete")}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
