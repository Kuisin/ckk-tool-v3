/**
 * cancel.tsx — 納品書 キャンセル確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the delivery-note detail action menu.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function CancelDeliveryNoteModal({
  opened,
  onClose,
  deliveryNumber,
}: ModalBaseProps & { deliveryNumber: string }) {
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="納品書のキャンセル"
      message={`納品書「${deliveryNumber}」をキャンセルします。この操作は取り消せません。`}
      confirmLabel="キャンセルする"
      warning="発行済みの納品書をキャンセルすると、納品先への再発行が必要になります。"
    />
  );
}
