"use client";

/**
 * DiscountRuleModal — 価格表 値引きルールの追加・編集.
 *
 * 期間 × 数量条件 → 値引き（率 % / 金額 ¥/本）を1件登録する。ルールは entry
 * ごとの専用リスト（価格表詳細の「値引き設定」タブ）で管理され、見積書作成時に
 * 条件を満たすルールが自動適用される。
 * TODO(server-action): persist to `price_list_discounts`.
 */

import {
  Alert,
  Group,
  NumberInput,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconCalendar, IconInfoCircle } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { FormModal, type ModalBaseProps } from "@/components/ui/modals";
import type { PriceDiscount } from "./mock";

const EMPTY: Omit<PriceDiscount, "id"> = {
  label: "",
  discountType: "RATE",
  value: 0,
  minQuantity: 1,
  maxQuantity: null,
  validFrom: "",
  validUntil: null,
  isActive: true,
};

export function DiscountRuleModal({
  opened,
  onClose,
  initial,
  onSave,
}: ModalBaseProps & {
  /** 編集対象のルール（新規追加時は null）. */
  initial: PriceDiscount | null;
  onSave: (rule: PriceDiscount) => void;
}) {
  const [draft, setDraft] = useState<Omit<PriceDiscount, "id">>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  // Re-seed each time the modal opens (add vs edit).
  useEffect(() => {
    if (opened) {
      setDraft(initial ? { ...initial } : EMPTY);
      setError(null);
    }
  }, [opened, initial]);

  const patch = (p: Partial<Omit<PriceDiscount, "id">>) =>
    setDraft((d) => ({ ...d, ...p }));

  return (
    <FormModal
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.label.trim() || draft.value <= 0 || !draft.validFrom) {
          setError("名称・値・有効開始日を入力してください");
          return;
        }
        if (draft.discountType === "RATE" && draft.value >= 100) {
          setError("率は100%未満を入力してください");
          return;
        }
        if (
          draft.maxQuantity != null &&
          draft.maxQuantity < draft.minQuantity
        ) {
          setError("数量上限は下限以上を入力してください");
          return;
        }
        // id は編集時のみ（新規は空 → saveDiscountRule が create する）。
        onSave({ id: initial?.id ?? "", ...draft });
        onClose();
      }}
      opened={opened}
      size="md"
      submitLabel={initial ? "更新" : "追加"}
      title={initial ? "値引きルールを編集" : "値引きルールを追加"}
    >
      <TextInput
        error={
          error && !draft.label.trim() ? "名称を入力してください" : undefined
        }
        label="名称"
        onChange={(e) => patch({ label: e.currentTarget.value })}
        placeholder="例: 夏季キャンペーン"
        value={draft.label}
        withAsterisk
      />

      <div>
        <Text fw={500} mb={4} size="sm">
          <HelpLabel
            help="率（%）は単価に対する割合、金額（¥/本）は1本あたりの値引き額です。"
            label="値引き種別"
          />
        </Text>
        <SegmentedControl
          data={[
            { value: "RATE", label: "率（%）" },
            { value: "AMOUNT", label: "金額（¥/本）" },
          ]}
          fullWidth
          onChange={(v) => patch({ discountType: v as "RATE" | "AMOUNT" })}
          value={draft.discountType}
        />
      </div>

      <NumberInput
        error={
          error && draft.value <= 0 ? "1以上を入力してください" : undefined
        }
        label={draft.discountType === "RATE" ? "率" : "値引き額（1本あたり）"}
        min={0}
        onChange={(v) => patch({ value: typeof v === "number" ? v : 0 })}
        prefix={draft.discountType === "AMOUNT" ? "¥" : undefined}
        suffix={draft.discountType === "RATE" ? " %" : undefined}
        thousandSeparator=","
        value={draft.value}
        withAsterisk
      />

      <Group grow>
        <NumberInput
          label={
            <HelpLabel
              help="このルールが適用される最小数量。上限は空欄で無制限。"
              label="数量下限"
            />
          }
          min={1}
          onChange={(v) =>
            patch({ minQuantity: typeof v === "number" ? v : 1 })
          }
          suffix=" 本"
          value={draft.minQuantity}
          withAsterisk
        />
        <NumberInput
          label="数量上限"
          min={1}
          onChange={(v) =>
            patch({ maxQuantity: typeof v === "number" ? v : null })
          }
          placeholder="空欄で上限なし"
          suffix=" 本"
          value={draft.maxQuantity ?? ""}
        />
      </Group>

      <Group grow>
        <DatePickerInput
          error={
            error && !draft.validFrom ? "開始日を選択してください" : undefined
          }
          label={
            <HelpLabel
              help="このルールが適用される期間。見積書作成日の時点で期間内のルールだけが適用されます。"
              label="有効開始日"
            />
          }
          leftSection={<IconCalendar size={14} />}
          onChange={(v) => patch({ validFrom: v ?? "" })}
          placeholder="日付を選択"
          value={draft.validFrom || null}
          valueFormat="YYYY/MM/DD"
          withAsterisk
        />
        <DatePickerInput
          clearable
          label="有効終了日"
          leftSection={<IconCalendar size={14} />}
          onChange={(v) => patch({ validUntil: v })}
          placeholder="空欄で無期限"
          value={draft.validUntil}
          valueFormat="YYYY/MM/DD"
        />
      </Group>

      <Switch
        checked={draft.isActive}
        label="有効"
        onChange={(e) => patch({ isActive: e.currentTarget.checked })}
      />

      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        条件（数量・期間）を満たすルールが見積書作成時に自動適用されます。複数該当する場合は値引き額が最大のルールを採用します。
      </Alert>

      <Stack gap={0}>
        {error && (
          <Text c="red" size="xs">
            {error}
          </Text>
        )}
      </Stack>
    </FormModal>
  );
}
