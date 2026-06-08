/**
 * deliver.tsx — 納品書 納品完了ポップアップ（ISSUED → DELIVERED）
 *
 * Controlled modal opened from the delivery-note detail action menu.
 * Built on the unified ModalShell scaffold (lib/modals).
 */

import { Text } from '@mantine/core';
import { ModalShell, type ModalBaseProps } from '../../../lib/modals';

export function DeliverDeliveryNoteModal({
  opened,
  onClose,
  deliveryNumber,
}: ModalBaseProps & { deliveryNumber: string }) {
  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title="納品完了"
      confirmLabel="納品完了"
      confirmColor="green"
      onConfirm={onClose}
      size="sm"
    >
      <Text size="sm">
        納品書「{deliveryNumber}」を納品完了にします。納品日時が記録されます。
      </Text>
    </ModalShell>
  );
}
