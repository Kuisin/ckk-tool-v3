/**
 * delete.tsx — 製品削除確認ポップアップ（破壊的操作）
 *
 * Controlled modal opened from the product detail action menu / list row action.
 * Uses the unified ConfirmModal scaffold (lib/modals).
 */

import { ConfirmModal, type ModalBaseProps } from '../../../lib/modals';

export function DeleteProductModal({
  opened,
  onClose,
  productCode,
  productName,
}: ModalBaseProps & { productCode: string; productName?: string }) {
  const label = productName ? `${productName}（${productCode}）` : productCode;
  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title="製品の削除"
      message={`製品「${label}」を削除します。この操作は取り消せません。`}
      confirmLabel="削除する"
      warning="受注・指示書で参照されている製品は削除できません。無効化をご検討ください。"
    />
  );
}
