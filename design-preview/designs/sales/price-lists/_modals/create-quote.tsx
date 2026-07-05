/**
 * create-quote.tsx — 価格表 → 見積書作成ポップアップ（印刷フローの起点）
 *
 * Controlled modal: the customer / product / unit price come from the price
 * list row — the user only enters 数量（+ 任意の値引き・納期）and a draft
 * quote is created (lib/pricing.ts resolution, §1). Built on FormModal.
 */

import { useState } from 'react';
import { Divider, Group, NumberInput, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconCalendar } from '@tabler/icons-react';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';
import { formatMoney } from '../../../lib/ui';

export function CreateQuoteModal({
  opened,
  onClose,
  customerName,
  productName,
  unitPrice,
  minQuantity,
}: ModalBaseProps & {
  customerName: string;
  productName: string;
  unitPrice: number;
  minQuantity: number;
}) {
  const [quantity, setQuantity] = useState<number | string>(minQuantity);
  const [discount, setDiscount] = useState<number | string>(0);
  const [deliveryDate, setDeliveryDate] = useState<Date | null>(null);

  const qty = typeof quantity === 'number' ? quantity : 0;
  const disc = typeof discount === 'number' ? discount : 0;
  const amount = Math.max(0, qty * unitPrice - disc);

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="見積書を作成"
      submitLabel="見積書を作成（下書き）"
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
      size="md"
    >
      <Text size="sm">
        {customerName} × {productName} の価格表から見積書を作成します。単価は価格表から自動解決されます。
      </Text>

      <Group gap="xl">
        <div>
          <Text size="xs" c="dimmed">単価（価格表）</Text>
          <Text size="sm" fw={600} ff="mono">{formatMoney(unitPrice)}</Text>
        </div>
      </Group>

      <NumberInput
        label="数量"
        suffix=" 本"
        min={1}
        withAsterisk
        value={quantity}
        onChange={setQuantity}
      />
      <NumberInput
        label="値引き"
        description="必要時のみ"
        prefix="¥"
        thousandSeparator=","
        decimalScale={2}
        min={0}
        value={discount}
        onChange={setDiscount}
      />
      <DatePickerInput
        label="納期"
        placeholder="日付を選択"
        leftSection={<IconCalendar size={14} />}
        valueFormat="YYYY/MM/DD"
        clearable
        value={deliveryDate}
        onChange={(v) => setDeliveryDate(v as unknown as Date | null)}
      />

      <Divider />
      <Group justify="flex-end" gap="xs">
        <Text size="sm" c="dimmed">金額</Text>
        <Text fw={700} ff="mono">{formatMoney(amount)}</Text>
      </Group>
    </FormModal>
  );
}
