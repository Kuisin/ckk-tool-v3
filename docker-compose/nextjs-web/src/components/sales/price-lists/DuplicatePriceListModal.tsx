"use client";

/**
 * DuplicatePriceListModal — "有効期間を変えて複製" (design.md §10.4).
 * Copies the current price list, letting the user set a new period + price.
 */

import { NumberInput, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconCalendar } from "@tabler/icons-react";
import { useState } from "react";
import { FormModal, type ModalBaseProps } from "@/components/ui/modals";

export function DuplicatePriceListModal({
  opened,
  onClose,
  productName,
  unitPrice,
}: ModalBaseProps & { productName: string; unitPrice: number }) {
  const [validFrom, setValidFrom] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [price, setPrice] = useState<number | string>(unitPrice);

  return (
    <FormModal
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        // TODO(server-action): create a copy with the new period/price.
        notifications.show({
          title: "複製しました",
          message: "新しい価格表を作成しました",
          color: "green",
        });
        onClose();
      }}
      opened={opened}
      size="md"
      submitLabel="複製して作成"
      title="価格表を複製"
    >
      <Text size="sm">
        「{productName}
        」の価格表を複製します。有効期間と単価を設定してください。
      </Text>
      <DatePickerInput
        label="有効開始日"
        leftSection={<IconCalendar size={14} />}
        onChange={setValidFrom}
        placeholder="日付を選択"
        value={validFrom}
        valueFormat="YYYY/MM/DD"
        withAsterisk
      />
      <DatePickerInput
        clearable
        label="有効終了日"
        leftSection={<IconCalendar size={14} />}
        onChange={setValidUntil}
        placeholder="空欄で無期限"
        value={validUntil}
        valueFormat="YYYY/MM/DD"
      />
      <NumberInput
        decimalScale={2}
        label="単価"
        min={0}
        onChange={setPrice}
        prefix="¥"
        thousandSeparator=","
        value={price}
      />
    </FormModal>
  );
}
