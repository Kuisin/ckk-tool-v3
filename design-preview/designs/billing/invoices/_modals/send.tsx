/**
 * send.tsx — 請求書 送付ポップアップ（ISSUED → SENT）
 *
 * Controlled FormModal: pick the 送付方法 and confirm sending the invoice.
 * Built on the unified FormModal scaffold (lib/modals).
 */

import { useState } from 'react';
import { Select, Stack, Text, Textarea } from '@mantine/core';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';

// tables.md INVOICE_METHOD
const SEND_METHOD_OPTIONS = [
  { value: 'EMAIL', label: 'メール' },
  { value: 'FAX', label: 'FAX' },
  { value: 'POST', label: '郵送' },
  { value: 'PORTAL', label: 'ポータル' },
];

export function SendInvoiceModal({
  opened,
  onClose,
  invoiceNumber,
}: ModalBaseProps & { invoiceNumber: string }) {
  const [method, setMethod] = useState<string | null>('EMAIL');
  const [note, setNote] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onClose();
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="請求書の送付"
      submitLabel="送付"
      size="sm"
      onSubmit={handleSubmit}
    >
      <Stack gap="md">
        <Text size="sm">請求書「{invoiceNumber}」を送付済にします。</Text>
        <Select
          label="送付方法"
          placeholder="送付方法を選択してください"
          data={SEND_METHOD_OPTIONS}
          withAsterisk
          value={method}
          onChange={setMethod}
        />
        <Textarea
          label="送付メモ"
          placeholder="送付に関する備考"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
      </Stack>
    </FormModal>
  );
}
