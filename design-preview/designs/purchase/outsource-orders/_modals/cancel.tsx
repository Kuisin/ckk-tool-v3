/**
 * cancel.tsx — 外注依頼 取消確認ポップアップ（破壊的操作）
 *
 * Controlled ConfirmModal opened from the list/detail action menu.
 * Built on the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function CancelOutsourceOrderModal({
  opened,
  onClose,
  label,
}: ModalBaseProps & { label: string }) {
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="外注依頼の取消"
      message={`外注依頼「${label}」を取り消します。この操作は取り消せません。`}
      confirmLabel="取消する"
      warning="既に外注先へ手配済みの場合は、先に外注先へ連絡してください。工程は未着手状態へ戻ります。"
    />
  );
}
