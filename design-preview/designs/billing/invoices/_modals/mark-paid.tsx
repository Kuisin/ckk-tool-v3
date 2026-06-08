/**
 * mark-paid.tsx — 請求書 支払済ポップアップ（SENT → PAID）
 *
 * Controlled modal opened from the invoice detail action menu.
 * Built on the unified ModalShell scaffold (lib/modals).
 */

import { Text } from '@mantine/core';
import { ModalShell, type ModalBaseProps } from '../../../lib/modals';

export function MarkPaidInvoiceModal({
  opened,
  onClose,
  invoiceNumber,
}: ModalBaseProps & { invoiceNumber: string }) {
  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title="支払済にする"
      confirmLabel="支払済にする"
      confirmColor="green"
      onConfirm={onClose}
      size="sm"
    >
      <Text size="sm">
        請求書「{invoiceNumber}」を支払済にします。入金が確認できたことを記録します。
      </Text>
    </ModalShell>
  );
}
