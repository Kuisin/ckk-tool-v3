/**
 * cancel.tsx — 出荷書 キャンセル確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the shipping-order detail action menu.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function CancelShippingOrderModal({
  opened,
  onClose,
  shippingOrderNumber,
}: ModalBaseProps & { shippingOrderNumber: string }) {
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="出荷書のキャンセル"
      message={`出荷書「${shippingOrderNumber}」をキャンセルします。この操作は取り消せません。`}
      confirmLabel="キャンセルする"
      warning="確定済みの出荷書をキャンセルすると、引当てられた在庫の予約が解除されます。"
    />
  );
}
