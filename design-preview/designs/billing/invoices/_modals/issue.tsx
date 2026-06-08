/**
 * issue.tsx — 請求書 発行ポップアップ（DRAFT → ISSUED）
 *
 * Controlled modal opened from the invoice detail action menu.
 * On confirm, the invoice is numbered (INV-YYYYMM-NNNNN) and the PDF generated.
 * Built on the unified ModalShell scaffold (lib/modals).
 */

import { useState } from 'react';
import { Stack, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconCalendar } from '@tabler/icons-react';
import { ModalShell, type ModalBaseProps } from '../../../lib/modals';

export function IssueInvoiceModal({
  opened,
  onClose,
  invoiceNumber,
}: ModalBaseProps & { invoiceNumber: string }) {
  const [dueDate, setDueDate] = useState<Date | null>(null);

  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title="請求書の発行"
      confirmLabel="発行"
      confirmColor="blue"
      onConfirm={onClose}
      size="sm"
    >
      <Stack gap="md">
        <Text size="sm">
          請求書「{invoiceNumber}」を発行します。発行と同時に採番・PDF 生成が行われます。
        </Text>
        <DatePickerInput
          label="支払期限"
          placeholder="日付を選択してください"
          leftSection={<IconCalendar size={14} />}
          valueFormat="YYYY/MM/DD"
          clearable
          value={dueDate}
          onChange={(v) => setDueDate(v as unknown as Date | null)}
        />
      </Stack>
    </ModalShell>
  );
}
