/**
 * confirm.tsx — 出荷書 確定ポップアップ（DRAFT → CONFIRMED）
 *
 * Controlled modal opened from the shipping-order detail action menu.
 * Built on the unified ModalShell scaffold (lib/modals).
 */

import { Text } from '@mantine/core';
import { ModalShell, type ModalBaseProps } from '../../../lib/modals';

export function ConfirmShippingOrderModal({
  opened,
  onClose,
  shippingOrderNumber,
}: ModalBaseProps & { shippingOrderNumber: string }) {
  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title="出荷書の確定"
      confirmLabel="確定"
      confirmColor="blue"
      onConfirm={onClose}
      size="sm"
    >
      <Text size="sm">
        出荷書「{shippingOrderNumber}」を確定します。確定後は在庫が引当てられ、出荷準備に進みます。
      </Text>
    </ModalShell>
  );
}
