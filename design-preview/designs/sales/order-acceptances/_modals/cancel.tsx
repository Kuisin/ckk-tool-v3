/**
 * cancel.tsx — 注文受諾書 キャンセル確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the detail action menu.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function CancelOrderAcceptanceModal({
  opened,
  onClose,
  orderNumber,
}: ModalBaseProps & { orderNumber: string }) {
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="注文受諾書のキャンセル"
      message={`注文受諾書「${orderNumber}」をキャンセルします。この操作は取り消せません。`}
      confirmLabel="キャンセルする"
      warning="関連する受注書が作成済みの場合、合わせて見直しが必要になります。"
    />
  );
}
