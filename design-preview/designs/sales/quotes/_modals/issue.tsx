/**
 * issue.tsx — 見積書発行ポップアップ（DRAFT → ISSUED）
 *
 * Controlled modal: set 有効期限 and confirm issuing the quote (generates the PDF).
 * Built on the unified ModalShell scaffold (lib/modals).
 */

import { useState } from 'react';
import { Checkbox, Stack, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconCalendar } from '@tabler/icons-react';
import { ModalShell, type ModalBaseProps } from '../../../lib/modals';

export function IssueQuoteModal({
  opened,
  onClose,
  quoteNumber,
}: ModalBaseProps & { quoteNumber: string }) {
  const [validUntil, setValidUntil] = useState<Date | null>(null);
  const [sendEmail, setSendEmail] = useState(true);

  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title="見積書の発行"
      confirmLabel="発行"
      confirmColor="blue"
      onConfirm={onClose}
      size="sm"
    >
      <Text size="sm">
        見積書「{quoteNumber}」を発行します。発行と同時に PDF が生成・保存され、詳細画面の PDF タブで閲覧できます。
      </Text>
      <DatePickerInput
        label="有効期限"
        placeholder="日付を選択"
        leftSection={<IconCalendar size={14} />}
        valueFormat="YYYY/MM/DD"
        clearable
        value={validUntil}
        onChange={(v) => setValidUntil(v as unknown as Date | null)}
      />
      <Stack gap="xs">
        <Checkbox
          label="発行後に顧客へメール送付する"
          checked={sendEmail}
          onChange={(e) => setSendEmail(e.currentTarget.checked)}
        />
      </Stack>
    </ModalShell>
  );
}
