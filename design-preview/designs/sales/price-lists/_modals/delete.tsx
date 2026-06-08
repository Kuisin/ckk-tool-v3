/**
 * delete.tsx — 価格表 削除確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the price-list detail / list row action.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function DeletePriceListModal({
  opened,
  onClose,
  productName,
}: ModalBaseProps & { productName: string }) {
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="価格表の削除"
      message={`「${productName}」の価格表を削除します。この操作は取り消せません。`}
      confirmLabel="削除する"
      warning="この価格表を参照中の見積書がある場合、単価の自動入力ができなくなります。"
    />
  );
}
