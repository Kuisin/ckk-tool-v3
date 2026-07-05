/**
 * register-price-list.tsx — 試算 → 価格表登録ポップアップ（CONFIRMED → REGISTERED）
 *
 * Controlled modal: shows the estimate's quantity tiers as the price-list rows
 * to be created, lets the user set the 有効期間, and confirms registration.
 * Built on the unified FormModal scaffold (lib/modals).
 */

import { useState } from 'react';
import { Alert, Table, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconCalendar, IconInfoCircle } from '@tabler/icons-react';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';
import { formatMoney } from '../../../lib/ui';
import { quantityRangeLabel } from '../_calc';

export interface RegisterTier {
  minQuantity: number;
  maxQuantity: number | null;
  unitPrice: number;
}

export function RegisterPriceListModal({
  opened,
  onClose,
  estimateNumber,
  customerName,
  productName,
  tiers,
}: ModalBaseProps & {
  estimateNumber: string;
  customerName: string;
  productName: string;
  tiers: RegisterTier[];
}) {
  const [validFrom, setValidFrom] = useState<Date | null>(new Date());
  const [validUntil, setValidUntil] = useState<Date | null>(null);

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="価格表に登録"
      submitLabel="価格表に登録"
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
      size="lg"
    >
      <Text size="sm">
        試算「{estimateNumber}」の数量区分別単価を、{customerName} × {productName} の価格表として登録します。
      </Text>

      <Table withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>数量範囲</Table.Th>
            <Table.Th ta="right">単価</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tiers.map((t, i) => (
            <Table.Tr key={i}>
              <Table.Td>{quantityRangeLabel(t.minQuantity, t.maxQuantity)}</Table.Td>
              <Table.Td><Text size="sm" ta="right" ff="mono">{formatMoney(t.unitPrice)}</Text></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

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

      <Alert variant="light" color="blue" icon={<IconInfoCircle size={16} />}>
        登録すると試算は「価格表登録済」となり編集できなくなります。単価を見直す場合は複製して再試算してください。
      </Alert>
    </FormModal>
  );
}
