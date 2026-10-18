"use client";

/**
 * ChargeItemFields.tsx — 料金マスタの入力欄（新規フォームと編集モーダルで共用）。
 *
 * 金額欄の見え方が `amountMode` で変わる — 固定は「この金額で使う」、可変は
 * 「入力欄の既定値」。同じ NumberInput が 2 つの意味を持つので、説明文を
 * 切り替えて何を入れる欄なのかを読めるようにする。
 */

import { NumberInput, Select, Stack, Switch, Textarea } from "@mantine/core";
import { useTranslations } from "next-intl";
import { LocalizedTextInput } from "@/components/ui/shells";

export interface ChargeItemFieldValues {
  nameJa: string;
  nameTranslations: Record<string, string>;
  amountMode: "FIXED" | "VARIABLE";
  defaultAmount: number | null;
  taxCategoryId: string | null;
  sortOrder: number;
  isActive: boolean;
  notes: string;
}

export function amountModeOptions(tr: (key: string) => string) {
  return [
    { value: "FIXED", label: tr("master.chargeItems.modeFixed") },
    { value: "VARIABLE", label: tr("master.chargeItems.modeVariable") },
  ];
}

export function ChargeItemFields({
  values,
  onChange,
  taxCategoryOptions,
  nameError,
}: {
  values: ChargeItemFieldValues;
  onChange: (part: Partial<ChargeItemFieldValues>) => void;
  taxCategoryOptions: { value: string; label: string }[];
  /** 名称の検証エラー（新規フォームが送信時に立てる）。 */
  nameError?: string | null;
}) {
  const tr = useTranslations();
  const fixed = values.amountMode === "FIXED";

  return (
    <Stack gap="sm">
      <LocalizedTextInput
        jaProps={{
          error: nameError ?? undefined,
          value: values.nameJa,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
            onChange({ nameJa: e.currentTarget.value }),
        }}
        label={tr("common.name2")}
        required
        translationsProps={{
          value: values.nameTranslations,
          onChange: (v: Record<string, string>) =>
            onChange({ nameTranslations: v }),
        }}
      />
      <Select
        data={amountModeOptions(tr)}
        description={
          fixed
            ? tr("master.chargeItems.modeFixedHelp")
            : tr("master.chargeItems.modeVariableHelp")
        }
        label={tr("master.chargeItems.amountMode")}
        onChange={(v) =>
          onChange({ amountMode: v === "VARIABLE" ? "VARIABLE" : "FIXED" })
        }
        value={values.amountMode}
        withAsterisk
      />
      <NumberInput
        decimalScale={2}
        description={
          fixed
            ? tr("master.chargeItems.amountFixedHelp")
            : tr("master.chargeItems.amountVariableHelp")
        }
        hideControls
        label={
          fixed
            ? tr("master.chargeItems.amount")
            : tr("master.chargeItems.defaultAmount")
        }
        min={0}
        onChange={(v) =>
          onChange({ defaultAmount: typeof v === "number" ? v : null })
        }
        prefix="¥"
        thousandSeparator=","
        value={values.defaultAmount ?? ""}
        withAsterisk={fixed}
      />
      <Select
        clearable
        data={taxCategoryOptions}
        description={tr("master.chargeItems.taxCategoryHelp")}
        label={tr("master.taxCategories.title")}
        onChange={(v) => onChange({ taxCategoryId: v })}
        placeholder={tr("master.taxCategories.useDefault")}
        value={values.taxCategoryId}
      />
      <NumberInput
        allowDecimal={false}
        label={tr("common.sortOrder")}
        min={0}
        onChange={(v) => onChange({ sortOrder: typeof v === "number" ? v : 0 })}
        value={values.sortOrder}
      />
      <Textarea
        autosize
        label={tr("common.notes")}
        minRows={2}
        onChange={(e) => onChange({ notes: e.currentTarget.value })}
        value={values.notes}
      />
      <Switch
        checked={values.isActive}
        label={tr("common.enabled")}
        onChange={(e) => onChange({ isActive: e.currentTarget.checked })}
      />
    </Stack>
  );
}
