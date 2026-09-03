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
import { useTranslations } from "next-intl";
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
  const tr = useTranslations();
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
          setError(tr("sales.priceLists.enterANameAValueAnd"));
          return;
        }
        if (draft.discountType === "RATE" && draft.value >= 100) {
          setError(tr("sales.priceLists.enterARateBelow100"));
          return;
        }
        if (
          draft.maxQuantity != null &&
          draft.maxQuantity < draft.minQuantity
        ) {
          setError(tr("sales.priceLists.theMaximumQuantityMustBeAt"));
          return;
        }
        // id は編集時のみ（新規は空 → saveDiscountRule が create する）。
        onSave({ id: initial?.id ?? "", ...draft });
        onClose();
      }}
      opened={opened}
      size="md"
      submitLabel={initial ? tr("common.update") : tr("common.add")}
      title={
        initial
          ? tr("sales.priceLists.editTheDiscountRule")
          : tr("common.addADiscountRule")
      }
    >
      <TextInput
        error={
          error && !draft.label.trim()
            ? tr("sales.discountRuleModal.enterAName")
            : undefined
        }
        label={tr("common.name2")}
        onChange={(e) => patch({ label: e.currentTarget.value })}
        placeholder={tr("sales.priceLists.eGSummerCampaign")}
        value={draft.label}
        withAsterisk
      />

      <div>
        <Text component="div" fw={500} mb={4} size="sm">
          <HelpLabel
            help={tr("sales.priceLists.rateIsAShareOfThe")}
            label={tr("sales.priceLists.discountType")}
          />
        </Text>
        <SegmentedControl
          data={[
            { value: "RATE", label: tr("sales.priceLists.rate") },
            { value: "AMOUNT", label: tr("sales.priceLists.amountPc") },
          ]}
          fullWidth
          onChange={(v) => patch({ discountType: v as "RATE" | "AMOUNT" })}
          value={draft.discountType}
        />
      </div>

      <NumberInput
        error={
          error && draft.value <= 0
            ? tr("sales.discountRuleModal.enterAtLeast1")
            : undefined
        }
        label={
          draft.discountType === "RATE"
            ? tr("sales.discountRuleModal.rateLabel")
            : tr("sales.priceLists.discountAmountPerPiece")
        }
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
              help={tr("sales.priceLists.theMinimumQuantityThisRuleApplies")}
              label={tr("sales.priceLists.minimumQuantity")}
            />
          }
          min={1}
          onChange={(v) =>
            patch({ minQuantity: typeof v === "number" ? v : 1 })
          }
          suffix={` ${tr("common.pcs")}`}
          value={draft.minQuantity}
          withAsterisk
        />
        <NumberInput
          label={tr("sales.priceLists.maximumQuantity")}
          min={1}
          onChange={(v) =>
            patch({ maxQuantity: typeof v === "number" ? v : null })
          }
          placeholder={tr("sales.priceLists.leaveBlankForNoMaximum")}
          suffix={` ${tr("common.pcs")}`}
          value={draft.maxQuantity ?? ""}
        />
      </Group>

      <Group grow>
        <DatePickerInput
          error={
            error && !draft.validFrom
              ? tr("master.approvalSettings.selectAStartDate")
              : undefined
          }
          label={
            <HelpLabel
              help={tr("sales.priceLists.thePeriodThisRuleAppliesTo")}
              label={tr("common.validFrom")}
            />
          }
          leftSection={<IconCalendar size={14} />}
          onChange={(v) => patch({ validFrom: v ?? "" })}
          placeholder={tr("common.pickADate")}
          value={draft.validFrom || null}
          valueFormat="YYYY/MM/DD"
          withAsterisk
        />
        <DatePickerInput
          clearable
          label={tr("common.validUntil")}
          leftSection={<IconCalendar size={14} />}
          onChange={(v) => patch({ validUntil: v })}
          placeholder={tr("common.leaveBlankForNoEndDate")}
          value={draft.validUntil}
          valueFormat="YYYY/MM/DD"
        />
      </Group>

      <Switch
        checked={draft.isActive}
        label={tr("common.enabled")}
        onChange={(e) => patch({ isActive: e.currentTarget.checked })}
      />

      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        {tr("sales.priceLists.rulesMeetingTheConditionsQuantityAnd")}
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
