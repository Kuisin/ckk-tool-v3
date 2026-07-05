"use client";

/**
 * DeletePriceListModal — destructive confirm (design.md §10.4 / §16.2).
 * Controlled; opened from the list row action or detail menu.
 */

import { ConfirmModal, type ModalBaseProps } from "@/components/ui/modals";

export function DeletePriceListModal({
  opened,
  onClose,
  productName,
  onConfirm,
}: ModalBaseProps & { productName: string; onConfirm?: () => void }) {
  return (
    <ConfirmModal
      confirmLabel="削除する"
      message={`「${productName}」の価格表を削除します。この操作は取り消せません。`}
      onClose={onClose}
      onConfirm={onConfirm}
      opened={opened}
      title="価格表の削除"
      warning="この価格表を参照中の見積書がある場合、単価の自動入力ができなくなります。"
    />
  );
}
