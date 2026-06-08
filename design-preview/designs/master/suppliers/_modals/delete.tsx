/**
 * delete.tsx — 外注企業削除確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the list row/bulk actions or detail menu.
 * Uses the unified ConfirmModal scaffold (lib/modals). Supports 1件 or 一括削除.
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function DeleteSupplierModal({
  opened,
  onClose,
  names,
}: ModalBaseProps & { names: string[] }) {
  const count = names.length;
  const label = count === 1 ? `「${names[0]}」` : `${count}件の外注企業`;

  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="外注企業の削除"
      message={`${label}を削除します。この操作は取り消せません。`}
      confirmLabel="削除する"
      warning="外注依頼の履歴がある外注企業は削除せず、無効化を推奨します。"
    />
  );
}
