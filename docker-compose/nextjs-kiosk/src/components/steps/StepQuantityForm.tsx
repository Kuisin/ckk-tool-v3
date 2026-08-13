"use client";

/**
 * StepQuantityForm.tsx — 完了時の数量入力（数量管理モード対応）。
 *
 * 受入数は開始時に確定した値で**固定表示**（完了時は編集不可）。作業者は
 * 不良区分（半製品/廃棄/手直し）だけを入力し、**良品数は 受入 − 総不良 で
 * 自動計算**して読み取り専用で表示する。総不良数も合計を表示する。
 * さらに任意で「不良理由（{理由, 数}）」を記録できる（補助記録・在庫には
 * 影響しない）。インライン検証は steps-core.checkConservation（負値 /
 * 不良超過）— 権威はサーバー。
 */

import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { IconAlertTriangle, IconPlus, IconTrash } from "@tabler/icons-react";
import type { DefectTypeView } from "@/lib/step-records";
import type { DefectReasonEntry, QuantityFormValues } from "@/lib/steps-core";
import {
  checkConservation,
  defectTotal,
  deriveSuccess,
} from "@/lib/steps-core";
import type { QuantityTrackingMode } from "@/lib/workflow-core";
import { useI18n } from "../I18nProvider";
import { NumberStepper } from "./NumberStepper";

type Props = {
  mode: Exclude<QuantityTrackingMode, "NONE">;
  values: QuantityFormValues;
  onChange: (values: QuantityFormValues) => void;
  /** 不良理由の候補（不良種類）。 */
  defectTypes: DefectTypeView[];
  reasons: DefectReasonEntry[];
  onReasonsChange: (reasons: DefectReasonEntry[]) => void;
};

const EMPTY_REASON: DefectReasonEntry = { reason: "", count: 1 };

export function StepQuantityForm({
  mode,
  values,
  onChange,
  defectTypes,
  reasons,
  onReasonsChange,
}: Props) {
  const { m } = useI18n();
  const labels = m.steps.quantity[mode];
  const issue = checkConservation(values, mode);
  const total = defectTotal(values);
  const success = deriveSuccess(values);

  const setQty = (key: keyof QuantityFormValues) => (n: number) =>
    onChange({ ...values, [key]: n });

  const setReason = (index: number, patch: Partial<DefectReasonEntry>) =>
    onReasonsChange(
      reasons.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );

  return (
    <Stack gap="md">
      {/* 受入数（固定）+ 良品数（自動計算）+ 総不良数 */}
      <SimpleGrid cols={3} spacing="sm">
        <Paper p="sm" radius="sm" withBorder>
          <Text c="dimmed" size="xs">
            {labels.input}
          </Text>
          <Text fw={700} size="xl">
            {values.inputQuantity}
          </Text>
          <Badge color="gray" mt={4} size="xs" variant="light">
            {m.steps.quantity.fixed}
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
            {m.steps.quantity.computed}
          </Badge>
        </Paper>
        <Paper p="sm" radius="sm" withBorder>
          <Text c="dimmed" size="xs">
            {m.steps.quantity.total}
          </Text>
          <Text c={total > 0 ? "orange" : undefined} fw={700} size="xl">
            {total}
          </Text>
        </Paper>
      </SimpleGrid>

      {/* 不良区分（在庫連携の権威） */}
      <Text c="dimmed" fw={600} size="sm">
        {m.steps.quantity.defectsTitle}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <NumberStepper
          label={labels.semi}
          onChange={setQty("outputDefectSemiFinished")}
          value={values.outputDefectSemiFinished}
        />
        <NumberStepper
          label={labels.scrap}
          onChange={setQty("outputDefectScrap")}
          value={values.outputDefectScrap}
        />
        <NumberStepper
          label={labels.rework}
          onChange={setQty("outputDefectRework")}
          value={values.outputDefectRework}
        />
      </SimpleGrid>

      {issue && (
        <Alert color="orange" icon={<IconAlertTriangle size={20} />}>
          {issue.kind === "NEGATIVE"
            ? m.steps.quantity.negative
            : m.steps.quantity.overInput(issue.sum, issue.input)}
        </Alert>
      )}

      {/* 不良理由（任意・補助記録） */}
      {total > 0 && (
        <Stack gap="xs">
          <Text c="dimmed" fw={600} size="sm">
            {m.steps.reasons.title}
          </Text>
          {reasons.map((row, index) => (
            <Group
              align="flex-end"
              gap="sm"
              // biome-ignore lint/suspicious/noArrayIndexKey: 追記専用の行フォーム
              key={index}
              wrap="nowrap"
            >
              <Select
                aria-label={m.steps.reasons.reason}
                data={defectTypes.map((d) => ({
                  value: d.name,
                  label: d.name,
                }))}
                onChange={(v) => setReason(index, { reason: v ?? "" })}
                placeholder={m.steps.reasons.reasonPlaceholder}
                searchable
                style={{ flex: 1 }}
                value={row.reason || null}
              />
              <Box style={{ width: 150, flexShrink: 0 }}>
                <NumberStepper
                  ariaLabel={m.steps.reasons.count}
                  compact
                  min={1}
                  onChange={(n) => setReason(index, { count: n })}
                  value={row.count}
                />
              </Box>
              {reasons.length > 1 && (
                <ActionIcon
                  aria-label={m.steps.reasons.remove}
                  color="red"
                  onClick={() =>
                    onReasonsChange(reasons.filter((_, i) => i !== index))
                  }
                  size={42}
                  variant="light"
                >
                  <IconTrash size={20} />
                </ActionIcon>
              )}
            </Group>
          ))}
          <Group>
            <ActionIcon
              aria-label={m.steps.reasons.add}
              onClick={() => onReasonsChange([...reasons, EMPTY_REASON])}
              size={42}
              variant="light"
            >
              <IconPlus size={20} />
            </ActionIcon>
            <Text c="dimmed" size="xs">
              {m.steps.reasons.hint}
            </Text>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}

/** 完了ボタンを押せるか（インライン検証が通っているか）。 */
export function isQuantityFormValid(
  values: QuantityFormValues,
  mode: QuantityTrackingMode,
): boolean {
  return checkConservation(values, mode) === null;
}
