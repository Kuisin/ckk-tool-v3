/**
 * issue.tsx — 納品書 発行ポップアップ（DRAFT → ISSUED）
 *
 * Controlled FormModal: confirm issuing the delivery note (generates the PDF),
 * with an option to record the delivery date and email the recipient.
 * Built on the unified FormModal scaffold (lib/modals).
 */

import { useState } from 'react';
import { Checkbox, Stack, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconCalendar } from '@tabler/icons-react';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';

export function IssueDeliveryNoteModal({
  opened,
  onClose,
  deliveryNumber,
}: ModalBaseProps & { deliveryNumber: string }) {
  const [deliveredAt, setDeliveredAt] = useState<Date | null>(null);
  const [sendEmail, setSendEmail] = useState(true);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onClose();
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="納品書の発行"
      submitLabel="発行"
      size="sm"
      onSubmit={handleSubmit}
    >
      <Stack gap="md">
        <Text size="sm">
          納品書「{deliveryNumber}」を発行します。発行と同時に PDF が生成されます。
        </Text>
        <DatePickerInput
          label="納品予定日"
          placeholder="日付を選択"
          leftSection={<IconCalendar size={14} />}
          valueFormat="YYYY/MM/DD"
          clearable
          value={deliveredAt}
          onChange={(v) => setDeliveredAt(v as unknown as Date | null)}
        />
        <Checkbox
          label="発行後に納品先へメール送付する"
          checked={sendEmail}
          onChange={(e) => setSendEmail(e.currentTarget.checked)}
        />
      </Stack>
    </FormModal>
  );
}
