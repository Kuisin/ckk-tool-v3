/**
 * run-closing.tsx — 締日処理を実行ポップアップ
 *
 * Controlled FormModal: select the 顧客 and 締日, then run the closing job.
 * On confirm, shipments (発送分のみ) are aggregated and an invoice generated.
 * Built on the unified FormModal scaffold (lib/modals).
 */

import { useState } from 'react';
import { Alert, Select, Stack, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconCalendar, IconInfoCircle } from '@tabler/icons-react';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';
import { CUSTOMERS } from '../../../lib/mock';

export function RunClosingModal({ opened, onClose }: ModalBaseProps) {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [closingDate, setClosingDate] = useState<Date | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onClose();
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="締日処理を実行"
      submitLabel="実行"
      size="md"
      onSubmit={handleSubmit}
    >
      <Stack gap="md">
        <Select
          label="顧客"
          placeholder="顧客を選択してください"
          data={CUSTOMERS}
          searchable
          withAsterisk
          value={customerId}
          onChange={setCustomerId}
        />
        <DatePickerInput
          label="締日"
          placeholder="日付を選択してください"
          leftSection={<IconCalendar size={14} />}
          valueFormat="YYYY/MM/DD"
          withAsterisk
          value={closingDate}
          onChange={(v) => setClosingDate(v as unknown as Date | null)}
        />
        <Alert color="gray" icon={<IconInfoCircle size={16} />} variant="light">
          発送レコードのみ集計対象です（在庫保管分は請求フロー外）。実行すると請求書が自動生成されます。
        </Alert>
      </Stack>
    </FormModal>
  );
}
