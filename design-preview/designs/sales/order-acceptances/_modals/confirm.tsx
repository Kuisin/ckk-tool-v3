/**
 * confirm.tsx — 注文受諾書 確定ポップアップ（→ CONFIRMED）
 *
 * Controlled modal: confirm the order acceptance after price matching.
 * Built on the unified ModalShell scaffold (lib/modals).
 */

import { Text } from '@mantine/core';
import { ModalShell, type ModalBaseProps } from '../../../lib/modals';

export function ConfirmOrderAcceptanceModal({
  opened,
  onClose,
  orderNumber,
}: ModalBaseProps & { orderNumber: string }) {
  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title="注文受諾書の確定"
      confirmLabel="確定"
      confirmColor="green"
      onConfirm={onClose}
      size="sm"
    >
      <Text size="sm">
        注文受諾書「{orderNumber}」を確定します。確定後は受注書の作成が可能になります。
      </Text>
    </ModalShell>
  );
}
