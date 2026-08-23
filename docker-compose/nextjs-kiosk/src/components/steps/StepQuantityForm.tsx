"use client";

/**
 * StepQuantityForm.tsx — 完了時の数量入力（数量管理モード対応）。
 *
 * 受入数は開始時に確定した値で**固定表示**（完了時は編集不可）。不良は
 * **1 本のリスト**で入力し、各行に 種別（半製品/廃棄/工程分岐）・不良種類
 * （マスタ FK・必須）・詳細（必須）・数 を持つ。区分ごとの合計はこのリストの
 * 合計として導出し、良品数 = 受入 − 総不良も自動計算する（いずれも読み取り
 * 専用表示）。在庫連携は区分合計をそのまま使うので不変。インライン検証は
 * steps-core.checkDefectList（負値 / 不良超過 / 必須未入力）— 権威はサーバー。
 */

import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconAlertTriangle, IconPlus, IconTrash } from "@tabler/icons-react";
import type { DefectTypeView } from "@/lib/step-records";
import {
  checkDefectList,
  type DefectDisposition,
  type DefectReasonEntry,
  defectListTotal,
  deriveSuccessFromList,
  dispositionTotals,
} from "@/lib/steps-core";
import type { QuantityTrackingMode } from "@/lib/workflow-core";
import { useI18n } from "../I18nProvider";
import { NumberStepper } from "./NumberStepper";

type Props = {
  mode: Exclude<QuantityTrackingMode, "NONE">;
  /** 開始時に確定した受入数（固定）。 */
  inputQuantity: number;
  /** 不良種類（理由の候補）。 */
  defectTypes: DefectTypeView[];
  defects: DefectReasonEntry[];
  onChange: (defects: DefectReasonEntry[]) => void;
};

export function StepQuantityForm({
  mode,
  inputQuantity,
  defectTypes,
  defects,
  onChange,
}: Props) {
  const { m } = useI18n();
  const labels = m.steps.quantity[mode];
  const issue = checkDefectList(defects, inputQuantity, mode);
  const total = defectListTotal(defects);
  const success = deriveSuccessFromList(inputQuantity, defects);
  const totals = dispositionTotals(defects);

  const setRow = (index: number, patch: Partial<DefectReasonEntry>) =>
    onChange(defects.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const addRow = () =>
    onChange([
      ...defects,
      { type: "SCRAP", defectTypeId: null, reason: "", count: 1 },
    ]);

  return (
    <Stack gap="md">
      {/* 受入数（固定）+ 良品数（自動計算）+ 総不良数 */}
      <SimpleGrid cols={3} spacing="sm">
        <Paper p="sm" radius="sm" withBorder>
          <Text c="dimmed" size="xs">
            {labels.input}
          </Text>
          <Text fw={700} size="xl">
            {inputQuantity}
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

      {/* 不良リスト（種別 + 理由 + 数） */}
      <Group justify="space-between">
        <Text c="dimmed" fw={600} size="sm">
          {m.steps.quantity.defectsTitle}
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
          <Stack gap="sm">
            <Group gap="sm" wrap="nowrap">
              <Select
                aria-label={m.steps.quantity.typeLabel}
                data={[
                  { value: "SEMI", label: labels.semi },
                  { value: "SCRAP", label: labels.scrap },
                  { value: "REWORK", label: labels.rework },
                ]}
                onChange={(v) =>
                  v && setRow(index, { type: v as DefectDisposition })
                }
                style={{ width: 150, flexShrink: 0 }}
                value={row.type}
              />
              <Select
                aria-label={m.steps.reasons.defectType}
                data={defectTypes.map((d) => ({
                  value: String(d.id),
                  label: d.name,
                }))}
                onChange={(v) =>
                  setRow(index, { defectTypeId: v ? Number(v) : null })
                }
                placeholder={m.steps.reasons.reasonPlaceholder}
                searchable
                style={{ flex: 1 }}
                value={
                  row.defectTypeId != null ? String(row.defectTypeId) : null
                }
              />
              {defects.length > 0 && (
                <ActionIcon
                  aria-label={m.steps.reasons.remove}
                  color="red"
                  onClick={() =>
                    onChange(defects.filter((_, i) => i !== index))
                  }
                  size={42}
                  variant="light"
                >
                  <IconTrash size={20} />
                </ActionIcon>
              )}
            </Group>
            <TextInput
              aria-label={m.steps.reasons.detail}
              maxLength={200}
              onChange={(e) => setRow(index, { reason: e.currentTarget.value })}
              placeholder={m.steps.reasons.detailPlaceholder}
              value={row.reason}
            />
            <Box style={{ maxWidth: 220 }}>
              <NumberStepper
                ariaLabel={m.steps.reasons.count}
                compact
                label={m.steps.reasons.count}
                min={1}
                onChange={(n) => setRow(index, { count: n })}
                value={row.count}
              />
            </Box>
          </Stack>
        </Paper>
      ))}

      <Button
        leftSection={<IconPlus size={20} />}
        onClick={addRow}
        variant="light"
      >
        {m.steps.quantity.addDefect}
      </Button>

      {issue && (
        <Alert color="orange" icon={<IconAlertTriangle size={20} />}>
          {issue.kind === "NEGATIVE"
            ? m.steps.quantity.negative
            : issue.kind === "INCOMPLETE"
              ? m.steps.quantity.incomplete
              : m.steps.quantity.overInput(issue.sum, issue.input)}
        </Alert>
      )}
    </Stack>
  );
}

/** 完了ボタンを押せるか（インライン検証が通っているか）。 */
export function isQuantityFormValid(
  defects: DefectReasonEntry[],
  inputQuantity: number,
  mode: QuantityTrackingMode,
): boolean {
  return checkDefectList(defects, inputQuantity, mode) === null;
}
