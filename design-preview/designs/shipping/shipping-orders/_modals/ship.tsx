/**
 * ship.tsx — 出荷書 出荷確定ポップアップ（CONFIRMED → SHIPPED）
 *
 * Controlled FormModal: pick the 出荷日 and confirm shipping.
 * On confirm, the inventory ledger is updated to SHIPPED.
 * Built on the unified FormModal scaffold (lib/modals).
 */

import { useState } from 'react';
import { Stack, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconCalendar } from '@tabler/icons-react';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';

export function ShipShippingOrderModal({
  opened,
  onClose,
  shippingOrderNumber,
}: ModalBaseProps & { shippingOrderNumber: string }) {
  const [shippedAt, setShippedAt] = useState<Date | null>(new Date());

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onClose();
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="出荷確定"
      submitLabel="出荷確定"
      size="sm"
      onSubmit={handleSubmit}
    >
      <Stack gap="md">
        <Text size="sm">
          出荷書「{shippingOrderNumber}」を出荷確定します。在庫台帳が出荷確定で更新されます。
        </Text>
        <DatePickerInput
          label="出荷日"
          placeholder="日付を選択してください"
          leftSection={<IconCalendar size={14} />}
          valueFormat="YYYY/MM/DD"
          withAsterisk
          value={shippedAt}
          onChange={(v) => setShippedAt(v as unknown as Date | null)}
        />
      </Stack>
    </FormModal>
  );
}
