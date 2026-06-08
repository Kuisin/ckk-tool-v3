/**
 * delete.tsx — 素材入荷 取消確認ポップアップ（破壊的操作）
 *
 * Controlled ConfirmModal opened from the list/detail action menu.
 * Built on the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function DeleteMaterialReceiptModal({
  opened,
  onClose,
  label,
}: ModalBaseProps & { label: string }) {
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="素材入荷の取消"
      message={`素材入荷「${label}」を取り消します。この操作は取り消せません。`}
      confirmLabel="取消する"
      warning="取り消すと素材在庫への入庫が巻き戻されます。引当済みの場合は先に予約解除が必要です。"
    />
  );
}
