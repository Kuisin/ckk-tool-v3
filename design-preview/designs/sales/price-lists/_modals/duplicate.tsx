/**
 * duplicate.tsx — 価格表 複製ポップアップ（有効期間を変えて複製）
 *
 * Controlled modal: copies the current price list, letting the user set a new
 * 有効期間 before saving. Built on the unified FormModal scaffold (lib/modals).
 */

import { useState } from 'react';
import { NumberInput, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconCalendar } from '@tabler/icons-react';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';

export function DuplicatePriceListModal({
  opened,
  onClose,
  productName,
  unitPrice,
}: ModalBaseProps & { productName: string; unitPrice: number }) {
  const [validFrom, setValidFrom] = useState<Date | null>(null);
  const [validUntil, setValidUntil] = useState<Date | null>(null);
  const [price, setPrice] = useState<number | string>(unitPrice);

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="価格表を複製"
      submitLabel="複製して作成"
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
      size="md"
    >
      <Text size="sm">
        「{productName}」の価格表を複製します。有効期間と単価を設定してください。
      </Text>
      <DatePickerInput
        label="有効開始日"
        placeholder="日付を選択"
        leftSection={<IconCalendar size={14} />}
        valueFormat="YYYY/MM/DD"
        withAsterisk
        value={validFrom}
        onChange={(v) => setValidFrom(v as unknown as Date | null)}
      />
      <DatePickerInput
        label="有効終了日"
        placeholder="空欄で無期限"
        leftSection={<IconCalendar size={14} />}
        valueFormat="YYYY/MM/DD"
        clearable
        value={validUntil}
        onChange={(v) => setValidUntil(v as unknown as Date | null)}
      />
      <NumberInput
        label="単価"
        prefix="¥"
        thousandSeparator=","
        decimalScale={2}
        min={0}
        value={price}
        onChange={setPrice}
      />
    </FormModal>
  );
}
