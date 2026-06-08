/**
 * cancel.tsx — 設計依頼書 キャンセル確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the detail action menu.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function CancelDesignRequestModal({
  opened,
  onClose,
  requestNumber,
}: ModalBaseProps & { requestNumber: string }) {
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="設計依頼書のキャンセル"
      message={`設計依頼書「${requestNumber}」をキャンセルします。この操作は取り消せません。`}
      confirmLabel="キャンセルする"
      warning="作業中の設計図がある場合、進行中の作業が破棄されます。"
    />
  );
}
