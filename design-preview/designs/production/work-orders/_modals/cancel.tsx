/**
 * cancel.tsx — 指示書キャンセル確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the work-order detail action menu.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function CancelWorkOrderModal({
  opened,
  onClose,
  workOrderNumber,
}: ModalBaseProps & { workOrderNumber: number }) {
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="指示書のキャンセル"
      message={`指示書 #${workOrderNumber} をキャンセルします。この操作は取り消せません。`}
      confirmLabel="キャンセルする"
      warning="進行中の工程・在庫予約はすべて解除されます。"
    />
  );
}
