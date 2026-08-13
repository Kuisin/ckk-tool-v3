"use client";

/**
 * StepQuantityForm.tsx — 完了時の数量入力（数量管理モード対応）。
 *
 * FLOW / INSPECTION は同じ保存則（良品 + 不良合計 = 受入）で、ラベルだけが
 * 変わる。NONE はそもそもこのフォームを出さない（サーバーがパススルーする）。
 * インライン検証は steps-core.checkConservation（サーバー側 validateQuantities
 * のミラー）— 権威はあくまでサーバー。
 */

import { Alert, Grid, NumberInput, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { QuantityFormValues } from "@/lib/steps-core";
import { checkConservation } from "@/lib/steps-core";
import type { QuantityTrackingMode } from "@/lib/workflow-core";
import { useI18n } from "../I18nProvider";

type Props = {
  mode: Exclude<QuantityTrackingMode, "NONE">;
  values: QuantityFormValues;
  onChange: (values: QuantityFormValues) => void;
};

export function StepQuantityForm({ mode, values, onChange }: Props) {
  const { m } = useI18n();
  const labels = m.steps.quantity[mode];
  const issue = checkConservation(values, mode);

  const set = (key: keyof QuantityFormValues) => (v: string | number) => {
    const n = typeof v === "number" ? v : Number.parseInt(v, 10);
    onChange({ ...values, [key]: Number.isFinite(n) ? n : Number.NaN });
  };

  return (
    <Stack gap="md">
      <NumberInput
        allowDecimal={false}
        allowNegative={false}
        label={labels.input}
        min={0}
        onChange={set("inputQuantity")}
        value={values.inputQuantity}
      />
      <NumberInput
        allowDecimal={false}
        allowNegative={false}
        label={labels.success}
        min={0}
        onChange={set("outputSuccessQuantity")}
        value={values.outputSuccessQuantity}
      />

      <Text c="dimmed" fw={600} size="sm">
        {m.steps.quantity.defectsTitle}
      </Text>
      <Grid>
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <NumberInput
            allowDecimal={false}
            allowNegative={false}
            label={labels.semi}
            min={0}
            onChange={set("outputDefectSemiFinished")}
            value={values.outputDefectSemiFinished}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <NumberInput
            allowDecimal={false}
            allowNegative={false}
            label={labels.scrap}
            min={0}
            onChange={set("outputDefectScrap")}
            value={values.outputDefectScrap}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <NumberInput
            allowDecimal={false}
            allowNegative={false}
            label={labels.rework}
            min={0}
            onChange={set("outputDefectRework")}
            value={values.outputDefectRework}
          />
        </Grid.Col>
      </Grid>

      {issue && (
        <Alert color="orange" icon={<IconAlertTriangle size={20} />}>
          {issue.kind === "NEGATIVE"
            ? m.steps.quantity.negative
            : m.steps.quantity.conservation(issue.sum, issue.input)}
        </Alert>
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
